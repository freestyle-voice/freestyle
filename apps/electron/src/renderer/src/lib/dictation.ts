import {
  getApiBase,
  getClient,
  getServerToken,
  initApiBase,
} from "@renderer/lib/api";
import { LevelMeter } from "@renderer/lib/level-meter";
import { Recorder, RecorderSupersededError } from "@renderer/lib/recorder";
import { Streamer } from "@renderer/lib/streamer";

export type DictationPhase = "idle" | "recording" | "transcribing";
export type DictationDestination = "cursor" | "composer";

export interface DictationCallbacks {
  onPhase: (phase: DictationPhase) => void;
  onPartial: (text: string) => void;
  onComposerText: (text: string) => void;
  onError: (message: string) => void;
  onLevel?: (level: number) => void;
}

export interface DictationOptions {
  destination: () => DictationDestination;
  outputMode: () => "paste" | "clipboard";
  soundEnabled: () => boolean;
  audioPlaybackMode: () => "off" | "duck" | "pause";
}

type TonePreset = "start" | "stop";

const TONE_PRESETS: Record<TonePreset, { freq: number; ms: number }> = {
  start: { freq: 347, ms: 125 },
  stop: { freq: 255, ms: 125 },
};

let toneCtx: AudioContext | null = null;

function getToneCtx(): AudioContext {
  if (!toneCtx || toneCtx.state === "closed") toneCtx = new AudioContext();
  return toneCtx;
}

async function playTone(preset: TonePreset, volume = 0.16): Promise<void> {
  const { freq, ms } = TONE_PRESETS[preset];
  try {
    const ctx = getToneCtx();
    if (ctx.state === "suspended") await ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    const now = ctx.currentTime;
    const dur = ms / 1000;
    const attack = Math.min(0.02, dur * 0.25);
    const g = gain.gain;
    g.setValueAtTime(0.0001, now);
    g.linearRampToValueAtTime(volume, now + attack);
    g.exponentialRampToValueAtTime(0.001, now + dur);
    g.linearRampToValueAtTime(0, now + dur + 0.012);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  } catch {}
}

let beforeOutputHookPresent = false;

async function refreshBeforeOutputHookPresence(): Promise<void> {
  try {
    const res = await getClient().api.output.hook.$get(
      {},
      { init: { signal: AbortSignal.timeout(3000) } },
    );
    if (res.ok) beforeOutputHookPresent = (await res.json()).present;
  } catch {}
}

export class DictationController {
  private recorder = new Recorder();
  private meter: LevelMeter | null = null;
  private streamer: Streamer | null = null;
  private active = false;
  private phase: DictationPhase = "idle";
  private appContext: string | null = null;
  private duckPromise: Promise<unknown> | undefined;
  private pending: string[] = [];
  private draining = false;

  constructor(
    private readonly callbacks: DictationCallbacks,
    private readonly options: DictationOptions,
  ) {
    void initApiBase()
      .then(() => {
        this.ensureStreamer();
        return refreshBeforeOutputHookPresence();
      })
      .catch(() => {});
  }

  private setPhase(next: DictationPhase): void {
    if (this.phase === next) return;
    this.phase = next;
    this.callbacks.onPhase(next);
  }

  private ensureStreamer(): Streamer {
    if (this.streamer) return this.streamer;
    this.streamer = new Streamer(getApiBase(), getServerToken(), {
      onPartial: (text) => this.callbacks.onPartial(text),
      onFinal: (text) => {
        this.setPhase("idle");
        const trimmed = text.trim();
        if (trimmed) this.pending.push(trimmed);
        void this.drain();
      },
      onError: (message) => {
        this.setPhase("idle");
        this.callbacks.onError(message);
      },
      onReady: () => {},
      onConfig: () => {},
    });
    return this.streamer;
  }

  private async mergeSegments(segments: string[]): Promise<string> {
    if (segments.length === 1) return segments[0];
    const combined = segments.join(" ");
    try {
      const res = await getClient().api["post-process"].$post({
        json: { text: combined, appContext: this.appContext },
      });
      if (!res.ok) return combined;
      const data = await res.json();
      if (data.disposition && data.disposition !== "deliver") return "";
      return data.cleaned || combined;
    } catch {
      return combined;
    }
  }

  private async drain(): Promise<void> {
    if (this.draining || this.active) return;
    this.draining = true;
    try {
      while (this.pending.length > 0 && !this.active) {
        const segments = this.pending;
        this.pending = [];
        const merged = await this.mergeSegments(segments);
        if (merged.trim()) await this.deliver(merged.trim());
      }
    } finally {
      this.draining = false;
    }
  }

  private async deliver(finalText: string): Promise<void> {
    if (this.options.destination() === "composer") {
      this.callbacks.onComposerText(finalText);
      return;
    }

    const requestedMode = this.options.outputMode();
    let text = finalText;
    let mode: "paste" | "clipboard" = requestedMode;
    let shouldDeliver = true;

    try {
      const res = await getClient().api.output.deliver.$post({
        json: {
          text: finalText,
          mode: requestedMode,
          appContext: this.appContext,
        },
      });
      if (res.ok) {
        const data = await res.json();
        text = data.output.text;
        mode = data.output.mode === "clipboard" ? "clipboard" : "paste";
        shouldDeliver = data.disposition === "deliver";
        void refreshBeforeOutputHookPresence();
      } else if (beforeOutputHookPresent) {
        shouldDeliver = false;
      }
    } catch {
      if (beforeOutputHookPresent) shouldDeliver = false;
    }

    if (shouldDeliver && text.trim()) {
      try {
        await (mode === "clipboard"
          ? window.api.copyText(text, this.appContext)
          : window.api.pasteText(text, this.appContext));
      } catch (err) {
        this.callbacks.onError(
          err instanceof Error ? err.message : "Could not deliver text",
        );
      }
    }
    window.api.sendTranscriptionDone();
  }

  private attachMeter(stream: MediaStream): void {
    const onLevel = this.callbacks.onLevel;
    if (!onLevel) return;
    if (!this.meter) this.meter = new LevelMeter(onLevel);
    this.meter.attach(stream);
  }

  private async captureAppContext(): Promise<void> {
    try {
      const app = await window.api.getFrontmostApp();
      this.appContext = app;
      this.streamer?.setContext(app);
    } catch {
      this.appContext = null;
      this.streamer?.setContext(null);
    }
  }

  isActive(): boolean {
    return this.active;
  }

  async start(): Promise<void> {
    if (this.active) return;
    this.active = true;
    this.setPhase("recording");
    try {
      if (this.options.soundEnabled()) void playTone("start");
      const mode = this.options.audioPlaybackMode();
      this.duckPromise =
        mode !== "off"
          ? window.api.prepareSystemAudio(mode).catch(() => {})
          : undefined;
      await initApiBase();
      const streamer = this.ensureStreamer();
      void this.captureAppContext();
      const stream = await this.recorder.acquireStream();
      if (!this.active) {
        this.recorder.releaseStream();
        return;
      }
      this.attachMeter(stream);
      await streamer.startCapture(stream);
    } catch (err) {
      this.active = false;
      this.setPhase("idle");
      this.meter?.detach();
      void this.restoreAudio();
      if (err instanceof RecorderSupersededError) return;
      this.callbacks.onError(
        err instanceof Error ? err.message : "Could not start recording",
      );
    }
  }

  private async restoreAudio(): Promise<void> {
    try {
      await this.duckPromise;
      await window.api.restoreSystemAudio();
    } catch {}
    this.duckPromise = undefined;
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;
    this.setPhase("transcribing");
    if (this.options.soundEnabled()) void playTone("stop");
    this.streamer?.commit();
    this.meter?.detach();
    this.recorder.releaseStream();
    void this.restoreAudio();
    void this.drain();
  }

  cancel(): void {
    this.active = false;
    this.setPhase("idle");
    this.pending = [];
    this.streamer?.cancel();
    this.meter?.detach();
    this.recorder.releaseStream();
    void this.restoreAudio();
  }

  destroy(): void {
    this.cancel();
    this.meter?.destroy();
    this.meter = null;
    this.streamer?.destroy();
    this.streamer = null;
  }
}
