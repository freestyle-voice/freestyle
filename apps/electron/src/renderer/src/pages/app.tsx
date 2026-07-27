import { capture } from "@renderer/lib/analytics";
import {
  apiFetch,
  getApiBase,
  getClient,
  getServerToken,
  isRemoteServer,
  refreshApiBase,
} from "@renderer/lib/api";
import {
  applyNeedsAppContextForCleanup,
  refreshNeedsAppContextForCleanup,
} from "@renderer/lib/cleanup-app-context";
import { Recorder } from "@renderer/lib/recorder";
import { Streamer } from "@renderer/lib/streamer";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type AudioPlaybackMode,
  normalizeAudioPlaybackMode,
} from "../../../shared/audio-playback";
import { SETTINGS_KEYS } from "../../../shared/settings-keys";

/** Bars visible inside the capsule. */
const BARS = 12;
/**
 * One spare bar at each end, sitting just outside the viewBox. While
 * recording, the row scrolls continuously: the right-hand spare is the sample
 * currently sliding into view and the left-hand one is sliding out. The SVG
 * viewport clips both, so the waveform enters and leaves cleanly.
 */
const DISPLAY_BARS = BARS + 2;
const RISE = 0.55;
const FALL = 0.22;
const SVG_WIDTH = 72;
/** Peak bar height. Kept well under PILL_HEIGHT so the waveform never
 * crowds the capsule's edge, even at full volume. */
const SVG_HEIGHT = 14;
/** Bar thickness; also the height of a bar at rest (drawn as a round dot). */
const BAR_WIDTH = 2.5;
/** Horizontal pitch between bars. */
const BAR_PITCH = SVG_WIDTH / BARS;
/**
 * How long each bar represents. The row advances one bar per interval, so
 * this sets the scroll speed (~80px/s) — brisk enough to read as live audio
 * without turning into a blur.
 */
const SAMPLE_MS = 75;

type PillState = "idle" | "initializing" | "recording" | "transcribing";

type BarMode = "connecting" | "listening" | "speaking";

// ---------------------------------------------------------------------------
// Sound
// ---------------------------------------------------------------------------

let _soundEnabled = true;
let _outputMode = "paste";
let _audioPlaybackMode: AudioPlaybackMode = "off";
let _toneCtx: AudioContext | null = null;

/**
 * Whether any loaded plugin implements `beforeOutput` (a suppression-capable
 * output hook). Cached so the delivery hot path doesn't round-trip every time.
 * Drives the fail-closed policy in `deliverFinal`: when a hook exists and the
 * `/deliver` call fails, we must NOT paste the raw text (that would bypass a
 * redaction/PII plugin). Assumed absent until proven present.
 */
let _beforeOutputHookPresent = false;

async function refreshBeforeOutputHookPresence(): Promise<void> {
  try {
    const res = await getClient().api.output.hook.$get(
      {},
      { init: { signal: AbortSignal.timeout(3000) } },
    );
    if (res.ok) _beforeOutputHookPresent = (await res.json()).present;
  } catch {
    // Leave the last-known value; a stale "present" errs safe (fail closed).
  }
}

function getToneCtx(): AudioContext {
  if (!_toneCtx || _toneCtx.state === "closed") _toneCtx = new AudioContext();
  return _toneCtx;
}

type TonePreset = "start" | "stop";
const TONE_PRESETS: Record<TonePreset, { freq: number; ms: number }> = {
  start: { freq: 347, ms: 125 }, // F4
  stop: { freq: 255, ms: 125 }, // C4
};

async function playTone(preset: TonePreset, volume = 0.16): Promise<void> {
  if (!_soundEnabled) return;
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

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothBars(prev: number[], next: number[]): number[] {
  return prev.map((p, i) => {
    const n = next[i] ?? 0;
    const k = n > p ? RISE : FALL;
    return p + (n - p) * k;
  });
}

const PILL_HEIGHT = 30;
/** Resting width. Grows by PILL_BADGE_EXTRA when the queue badge is shown. */
const PILL_WIDTH = 104;
const PILL_BADGE_EXTRA = 18;

/**
 * The pill floats over arbitrary application windows, so it commits to a
 * single dark treatment in both themes rather than following the app theme —
 * a light pill reads as a blown-out blob over dark editors. The tint is the
 * brand's dark surface, translucent over a blur so it picks up a hint of
 * whatever is behind it.
 */
const pillInnerStyle: React.CSSProperties = {
  height: PILL_HEIGHT,
  borderRadius: PILL_HEIGHT / 2,
  background: "rgba(22, 20, 15, 0.92)",
  border: "1px solid rgba(255, 255, 255, 0.10)",
  backdropFilter: "blur(20px) saturate(180%)",
  WebkitBackdropFilter: "blur(20px) saturate(180%)",
  boxShadow: "0 6px 20px rgba(0, 0, 0, 0.30), 0 1px 3px rgba(0, 0, 0, 0.22)",
  cursor: "grab",
  WebkitAppRegion: "drag",
  transition: "width 260ms cubic-bezier(0.22, 1, 0.36, 1)",
} as React.CSSProperties;

interface TranscribeResult {
  raw: string;
  cleaned: string;
  error?: string;
  cloudAuthRequired?: boolean;
  usageExceeded?: boolean;
  providerCategory?: string;
  /**
   * Terminal pipeline disposition from the server. A plugin that called
   * `api.control.consume()`/`abort()` in a server hook resolves to
   * `"suppressed"`/`"aborted"` here, and the dictation is dropped without
   * delivery. Defaults to `"deliver"` for older server responses.
   */
  disposition?: "deliver" | "suppressed" | "aborted";
}

/**
 * Error text attached to usage-limit results. The interactive prompt (with an
 * "Upgrade to Pro" action) is shown by the main process via
 * `window.api.cloudPromptUpgrade()` — this string only surfaces where a plain
 * error message is needed.
 */
const USAGE_LIMIT_DIALOG_MESSAGE =
  "You've used your free Freestyle Cloud dictation for this week. Upgrade to Pro for unlimited dictation, or switch to a local or bring-your-own-key model in Settings > Models.";

/**
 * The app context (process name + window title) can contain characters
 * outside ISO-8859-1 — e.g. a Cyrillic file path in the Notepad++ title
 * bar. HTTP header values only allow Latin-1, so passing the raw JSON
 * makes fetch() throw "Failed to execute 'fetch'". Percent-encode it so
 * the header is always byte-safe; the server decodes it back.
 */
function encodeAppContext(context: string): string {
  return encodeURIComponent(context);
}

interface QueueEntry {
  promise: Promise<TranscribeResult>;
}

export default function AppPage(): React.JSX.Element {
  const [state, setState] = useState<PillState>("idle");
  const stateRef = useRef<PillState>("idle");
  const setPillState = useCallback((next: PillState) => {
    stateRef.current = next;
    setState(next);
  }, []);
  const [pillAlign, setPillAlign] = useState<"start" | "end">("end");
  const [pillSide, setPillSide] = useState<"center" | "right">("center");

  const supportsSessionTransportRef = useRef(false);
  const recordingSessionUsesTransportRef = useRef(false);
  const providerCategoryRef = useRef<string | null>(null);

  const [pendingCount, setPendingCount] = useState(0);

  const recorderRef = useRef(new Recorder());
  const streamerRef = useRef<Streamer | null>(null);
  const analyserCtxRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const analyserNodeRef = useRef<AnalyserNode | null>(null);
  const barsRef = useRef<number[]>(new Array(DISPLAY_BARS).fill(0));
  const barsSvgRef = useRef<SVGSVGElement>(null);
  const barsGroupRef = useRef<SVGGElement>(null);
  /**
   * Scroll state for the recording waveform. `frac` is the progress (0..1)
   * toward the next sample and drives a sub-pixel translate, so the row
   * glides rather than stepping one bar at a time. `peak` holds the loudest
   * level seen since the last sample so a brief transient isn't missed.
   */
  const scrollRef = useRef({ lastSampleAt: 0, frac: 0, peak: 0 });
  const volumeRef = useRef(0);
  const rafRef = useRef<number>(0);
  const startTimeRef = useRef(0);
  const wantsMicRef = useRef(false);
  /** True only while state is "recording" — used by the queue drain wait loop. */
  const recordingActiveRef = useRef(false);
  const appContextRef = useRef<string | null>(null);
  const pendingCommitRef = useRef(false);
  const pillActiveRef = useRef(false);
  // Tracks the in-flight prepareSystemAudio() (ducking) call. Ducking runs
  // concurrently with mic acquisition, so every restore must wait for this
  // to settle — otherwise a restore that lands before the duck applies is a
  // no-op and leaves the system volume stuck low.
  const duckingPromiseRef = useRef<Promise<unknown> | undefined>(undefined);
  const barModeRef = useRef<BarMode | null>(null);
  const modeStartRef = useRef(0);
  const lastIpcTimeRef = useRef(0);
  const freqDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);

  const queueRef = useRef<QueueEntry[]>([]);
  const drainingRef = useRef(false);
  const streamResolverRef = useRef<((r: TranscribeResult) => void) | null>(
    null,
  );
  const drainAgainRef = useRef(false);
  // Set when the user presses the hotkey to start a new dictation while a
  // streaming commit is still finalizing. The single WebSocket/PCM buffer can't
  // host two streaming sessions at once, so instead of dropping the press we
  // replay it once the pending commit resolves.
  const pendingReRecordRef = useRef(false);

  const isTranscriptionIdle = useCallback(
    (): boolean =>
      queueRef.current.length === 0 &&
      !drainingRef.current &&
      streamResolverRef.current === null,
    [],
  );

  // ---- Queue drain ----
  // biome-ignore lint/correctness/useExhaustiveDependencies: drainQueue only reads refs plus hidePill, which is declared later in this component, so adding it to the deps array would reference it before initialization (TDZ). The empty array is intentional.
  const drainQueue = useCallback(async () => {
    if (drainingRef.current) {
      drainAgainRef.current = true;
      return;
    }
    drainingRef.current = true;

    try {
      while (recordingActiveRef.current && pillActiveRef.current) {
        await new Promise((r) => setTimeout(r, 100));
      }

      if (!pillActiveRef.current || queueRef.current.length === 0) {
        return;
      }

      const batch = [...queueRef.current];
      queueRef.current = [];

      const results = await Promise.all(batch.map((e) => e.promise));

      if (!pillActiveRef.current) {
        return;
      }

      // A dictation is deliverable only when it has text AND the server
      // didn't mark it suppressed/aborted (a plugin calling
      // `api.control.consume()`/`abort()` in a server hook). Absent
      // disposition (older responses) is treated as "deliver".
      const isDeliverable = (r: TranscribeResult): boolean =>
        !!r.raw.trim() && (r.disposition ?? "deliver") === "deliver";

      if (
        recordingActiveRef.current ||
        wantsMicRef.current ||
        queueRef.current.length > 0
      ) {
        const resolved = results
          .filter(isDeliverable)
          .map((r) => ({ promise: Promise.resolve(r) }));
        queueRef.current = [...resolved, ...queueRef.current];
        return;
      }

      const nonEmpty = results.filter(isDeliverable);
      if (nonEmpty.length === 0) {
        if (results.some((r) => r.cloudAuthRequired)) {
          hidePill();
          void window.api.cloudPromptSignIn();
          return;
        }
        if (results.some((r) => r.usageExceeded)) {
          hidePill();
          void window.api.cloudPromptUpgrade();
          return;
        }
        const errMsg = results.find((r) => r.error)?.error;
        if (errMsg) {
          hidePill();
          window.api.showErrorDialog("Transcription Failed", errMsg);
        } else if (wantsMicRef.current) {
          // Re-record may have resolved the in-flight stream with an empty
          // result; a new recording is starting — keep the pill visible.
          return;
        } else {
          hidePill();
        }
        return;
      }

      let finalText: string;

      if (nonEmpty.length === 1) {
        finalText = nonEmpty[0].cleaned.trim() || nonEmpty[0].raw.trim();
      } else {
        const combined = nonEmpty.map((r) => r.raw).join(" ");
        try {
          const res = await getClient().api["post-process"].$post({
            json: {
              text: combined,
              appContext: appContextRef.current,
            },
          });
          if (!pillActiveRef.current) {
            return;
          }
          if (res.ok) {
            const data = await res.json();
            // A plugin that consumed/aborted during the multi-segment merge
            // suppresses delivery: keep the text empty so it's dropped below,
            // rather than falling back to the combined raw.
            finalText =
              data.disposition && data.disposition !== "deliver"
                ? ""
                : data.cleaned || combined;
          } else if (res.status === 401) {
            const body = (await res.json().catch(() => null)) as {
              error?: string;
            } | null;
            if (body?.error === "cloud_auth_required") {
              hidePill();
              void window.api.cloudPromptSignIn();
              return;
            }
            finalText = combined;
          } else {
            finalText = combined;
          }
        } catch {
          finalText = combined;
        }
      }

      if (!pillActiveRef.current) {
        return;
      }

      if (recordingActiveRef.current || queueRef.current.length > 0) {
        queueRef.current = [
          { promise: Promise.resolve({ raw: finalText, cleaned: finalText }) },
          ...queueRef.current,
        ];
        return;
      }

      try {
        const requestedMode =
          _outputMode === "clipboard" ? "clipboard" : "paste";
        let deliverText = finalText;
        let deliverMode: "paste" | "clipboard" = requestedMode;
        let shouldDeliver = true;

        // Run the `beforeOutput` plugin hook server-side, on the final
        // (post multi-segment-merge) text — this is the one point where the
        // fully-assembled dictation is known, whether it came from a single
        // chunk or several combined via `/api/post-process`.
        //
        // Fail-closed: if a `beforeOutput` hook exists (it may suppress/redact)
        // and this call fails, we must NOT paste the raw text — dropping the
        // dictation is safer than leaking un-redacted output. When no such hook
        // is present, a transient failure falls back to delivering unchanged.
        try {
          const res = await getClient().api.output.deliver.$post({
            json: {
              text: finalText,
              mode: requestedMode,
              appContext: appContextRef.current,
            },
          });
          if (res.ok) {
            const data = await res.json();
            deliverText = data.output.text;
            deliverMode =
              data.output.mode === "clipboard" ? "clipboard" : "paste";
            shouldDeliver = data.disposition === "deliver";
            // The call succeeded, so the server's registry is reachable: refresh
            // our cached hook-presence for the next (possibly failing) delivery.
            void refreshBeforeOutputHookPresence();
          } else if (_beforeOutputHookPresent) {
            shouldDeliver = false;
          }
        } catch {
          if (_beforeOutputHookPresent) {
            // Fail closed: a suppression-capable hook exists but we couldn't run
            // it. Drop delivery rather than risk leaking un-redacted text.
            shouldDeliver = false;
            console.warn(
              "[pill] beforeOutput unreachable; suppressing delivery (fail-closed)",
            );
          }
          // Otherwise best-effort — deliver the client-decided text/mode.
        }

        if (shouldDeliver && deliverText.trim()) {
          if (deliverMode === "clipboard") {
            await window.api.copyText(deliverText, appContextRef.current);
          } else {
            await window.api.pasteText(deliverText, appContextRef.current);
          }
        }
      } catch (err) {
        console.error("[pill] paste/copy failed:", err);
      }
      window.api.sendTranscriptionDone();

      // North-star usage metric: fires exactly once per completed dictation,
      // at the single point where single-chunk and multi-chunk paths converge
      // and text is delivered to the user.
      const providerCategory =
        nonEmpty.find((r) => r.providerCategory)?.providerCategory ??
        providerCategoryRef.current ??
        undefined;
      capture("dictation completed", {
        segments: nonEmpty.length,
        multi_segment: nonEmpty.length > 1,
        output_mode: _outputMode,
        char_count: finalText.length,
        provider_category: providerCategory,
      });

      if (
        !recordingActiveRef.current &&
        queueRef.current.length === 0 &&
        pillActiveRef.current
      ) {
        hidePill();
      }
    } finally {
      drainingRef.current = false;
      if (drainAgainRef.current) {
        drainAgainRef.current = false;
        void drainQueue();
      } else if (
        pillActiveRef.current &&
        stateRef.current === "transcribing" &&
        !wantsMicRef.current &&
        !recordingActiveRef.current &&
        isTranscriptionIdle()
      ) {
        hidePill();
      }
    }
  }, []);

  // ---- REST fallback (full recorded WAV kept by the streamer) ----
  const restFallbackTranscribe = useCallback(
    (errorMsg: string): Promise<TranscribeResult> | null => {
      const wavBlob = streamerRef.current?.getWavBlob() ?? null;
      if (!wavBlob) return null;
      const headers: Record<string, string> = {
        "Content-Type": "audio/wav",
        "x-audio-duration-ms": String(Date.now() - startTimeRef.current),
      };
      if (appContextRef.current)
        headers["x-app-context"] = encodeAppContext(appContextRef.current);
      if (queueRef.current.length > 0 || drainingRef.current)
        headers["x-skip-post-process"] = "true";
      return apiFetch("/api/transcribe", {
        method: "POST",
        body: wavBlob,
        headers,
      })
        .then(async (res) => {
          if (!res.ok) {
            const body = (await res.json().catch(() => null)) as {
              error?: string;
            } | null;
            if (res.status === 401 && body?.error === "cloud_auth_required") {
              return {
                raw: "",
                cleaned: "",
                error: "Sign in to Freestyle Transcribe",
                cloudAuthRequired: true,
              };
            }
            if (res.status === 429 && body?.error === "usage_exceeded") {
              return {
                raw: "",
                cleaned: "",
                error: USAGE_LIMIT_DIALOG_MESSAGE,
                usageExceeded: true,
              };
            }
            return { raw: "", cleaned: "", error: errorMsg };
          }
          const data = (await res.json()) as {
            raw?: string;
            cleaned?: string;
            provider_category?: string;
          };
          return {
            raw: (data.raw || "").trim(),
            cleaned: (data.cleaned || data.raw || "").trim(),
            providerCategory: data.provider_category,
          };
        })
        .catch(() => ({ raw: "", cleaned: "", error: errorMsg }));
    },
    [],
  );

  // ---- Streamer (lazy singleton, only created when streaming is enabled) ----
  // biome-ignore lint/correctness/useExhaustiveDependencies: singleton
  const getStreamer = useCallback((): Streamer => {
    if (!streamerRef.current) {
      streamerRef.current = new Streamer(getApiBase(), getServerToken(), {
        onConfig: (config) => {
          // Only update support for *future* sessions. The per-session decision
          // (recordingSessionUsesTransportRef) is latched once in startRecording
          // and must never be mutated mid-session: a config arriving after the
          // first recording has already committed to the batch path would flip
          // commit to the streaming path, which captured no audio → "No audio
          // captured". This is the first-dictation-after-restart failure.
          supportsSessionTransportRef.current = config.sessionTransport;
          if (config.providerCategory) {
            providerCategoryRef.current = config.providerCategory;
          }
        },
        onReady: () => {},
        onPartial: () => {},
        onFinal: (text) => {
          const resolver = streamResolverRef.current;
          if (!resolver) return;
          streamResolverRef.current = null;
          // A short clip can stream to a live provider that finalizes before it
          // has recognized any words (cold Soniox/Freestyle Cloud session), so
          // the streaming final comes back empty even though audio was captured.
          // Salvage via the batch REST path with the recorded WAV the streamer
          // still has buffered — the same clip transcribes fine one-shot. If no
          // WAV exists (genuine silence) the empty result stands.
          if (!text.trim()) {
            const fallback = restFallbackTranscribe("");
            if (fallback) {
              void fallback.then(resolver);
              return;
            }
          }
          resolver({ raw: text, cleaned: text });
        },
        onCleaned: () => {},
        onError: (msg, code) => {
          const resolver = streamResolverRef.current;
          // Cloud auth expiry and usage limits are terminal — don't fall back
          // to REST (it would just re-hit the same cloud error). Surface them
          // directly, or flag the pending result so the drain loop does.
          if (code === "cloud_auth_required") {
            streamResolverRef.current = null;
            if (resolver) {
              resolver({ raw: "", cleaned: "", cloudAuthRequired: true });
            } else if (pillActiveRef.current) {
              hidePill();
              void window.api.cloudPromptSignIn();
            }
            return;
          }
          if (code === "usage_exceeded") {
            streamResolverRef.current = null;
            if (resolver) {
              resolver({ raw: "", cleaned: "", usageExceeded: true });
            } else if (pillActiveRef.current) {
              hidePill();
              void window.api.cloudPromptUpgrade();
            }
            return;
          }
          if (resolver) {
            streamResolverRef.current = null;
            const fallback = restFallbackTranscribe(msg);
            if (fallback) {
              void fallback.then(resolver);
              return;
            }
            resolver({ raw: "", cleaned: "", error: msg });
            return;
          }
          if (!supportsSessionTransportRef.current) return;
          if (!pillActiveRef.current) return;
          if (wantsMicRef.current) return;
          hidePill();
          window.api.showErrorDialog("Transcription Failed", msg);
        },
      });
    }
    return streamerRef.current;
  }, []);

  // ---- Bar animation loop ----
  const applyBarsToSvg = useCallback(() => {
    const svg = barsSvgRef.current;
    if (!svg) return;
    const frac = scrollRef.current.frac;
    barsGroupRef.current?.setAttribute(
      "transform",
      `translate(${-frac * BAR_PITCH} 0)`,
    );

    const lines = svg.querySelectorAll("line");
    for (let i = 0; i < lines.length; i++) {
      const val = barsRef.current[i] ?? 0;
      // A bar never fully collapses: at rest it is exactly as tall as it is
      // wide, so the round caps leave a row of evenly spaced dots.
      const h = Math.max(BAR_WIDTH, val * SVG_HEIGHT);
      lines[i].setAttribute("y1", String((SVG_HEIGHT + h) / 2));
      lines[i].setAttribute("y2", String((SVG_HEIGHT - h) / 2));

      // Fade a bar out over the last half-pitch at either end so samples
      // dissolve at the capsule's edges instead of popping in and out.
      const x = BAR_PITCH * (i + 0.5) - BAR_PITCH - frac * BAR_PITCH;
      const edge =
        clamp01(x / (BAR_PITCH * 0.5)) *
        clamp01((SVG_WIDTH - x) / (BAR_PITCH * 0.5));

      lines[i].style.opacity = String((0.32 + val * 0.68) * edge);
    }
  }, []);

  const runBars = useCallback(() => {
    const mode = barModeRef.current;
    if (!mode) return;

    if (mode === "connecting") {
      // A slow, low-amplitude breath travelling along the row: the pill is
      // awake but has nothing to show yet. Deliberately understated so the
      // jump to real audio levels reads as the pill "catching" your voice.
      const t = (performance.now() - modeStartRef.current) / 1000;
      const raw: number[] = [];
      for (let i = 0; i < DISPLAY_BARS; i++) {
        raw.push(0.06 + 0.07 * (1 + Math.sin(t * 3.2 - (i - 1) * 0.42)));
      }
      barsRef.current = smoothBars(barsRef.current, raw);
      volumeRef.current = 0.15;
    } else if (mode === "listening") {
      const analyser = analyserNodeRef.current;
      const dataArray = freqDataRef.current;
      if (analyser && dataArray) {
        analyser.getByteFrequencyData(dataArray);
        const VOICE_MIN = 80;
        const VOICE_MAX = 4000;

        const sampleRate = analyser.context.sampleRate;
        const binWidth = sampleRate / analyser.fftSize;

        const startBin = Math.max(0, Math.floor(VOICE_MIN / binWidth));
        const endBin = Math.min(
          analyser.frequencyBinCount,
          Math.ceil(VOICE_MAX / binWidth),
        );

        // Compute one overall voice level
        let sum = 0;
        for (let i = startBin; i < endBin; i++) {
          sum += dataArray[i];
        }

        const voiceLevel = sum / (Math.max(1, endBin - startBin) * 255);

        // Scrolling waveform, tape-deck style: every SAMPLE_MS the row shifts
        // one bar to the left and the newest level enters from the right, so
        // each bar is a frozen moment of audio rather than a live meter. The
        // bars deliberately aren't smoothed toward a target here — easing them
        // would smear the history and wash the motion out.
        const level = Math.min(1, voiceLevel * 2.8);
        const scroll = scrollRef.current;
        scroll.peak = Math.max(scroll.peak, level);

        const now = performance.now();
        let elapsed = now - scroll.lastSampleAt;
        // A long stall (window occluded, GC pause) shouldn't replay every
        // missed sample — jump straight to the present instead.
        if (elapsed > SAMPLE_MS * DISPLAY_BARS) {
          scroll.lastSampleAt = now;
          elapsed = 0;
        }
        while (elapsed >= SAMPLE_MS) {
          barsRef.current.shift();
          barsRef.current.push(scroll.peak);
          scroll.peak = level;
          scroll.lastSampleAt += SAMPLE_MS;
          elapsed -= SAMPLE_MS;
        }
        scroll.frac = elapsed / SAMPLE_MS;

        // The bar still sliding into view tracks the live level so the
        // leading edge responds instantly rather than a sample behind.
        barsRef.current[DISPLAY_BARS - 1] = scroll.peak;

        volumeRef.current = level;
        if (now - lastIpcTimeRef.current >= 100) {
          lastIpcTimeRef.current = now;
          window.api?.sendAudioLevel(level);
        }
      }
    } else if (mode === "speaking") {
      // Transcribing: a single soft bump sweeping left to right on a loop,
      // with a pause between passes. Reads as progress rather than as audio.
      const t = (performance.now() - modeStartRef.current) / 1000;
      const SWEEP = 1.15; // seconds of travel
      const GAP = 0.35; // seconds of rest between passes
      const phase = (t % (SWEEP + GAP)) / SWEEP;
      const head = phase * (BARS + 4) - 2;
      const raw: number[] = [];
      for (let i = 0; i < DISPLAY_BARS; i++) {
        const d = i - 1 - head;
        raw.push(0.08 + 0.72 * Math.exp(-(d * d) / 3.2));
      }
      barsRef.current = smoothBars(barsRef.current, raw);
      volumeRef.current = 0.4;
    }

    applyBarsToSvg();
    rafRef.current = requestAnimationFrame(runBars);
  }, [applyBarsToSvg]);

  // ---- Visualization control ----
  const startBarAnimation = useCallback(
    (mode: BarMode) => {
      cancelAnimationFrame(rafRef.current);
      barModeRef.current = mode;
      modeStartRef.current = performance.now();
      // Only "listening" scrolls; the other modes animate in place, so their
      // translate must sit at zero or the row renders half a bar off-centre.
      scrollRef.current = {
        lastSampleAt: performance.now(),
        frac: 0,
        peak: 0,
      };
      rafRef.current = requestAnimationFrame(runBars);
    },
    [runBars],
  );

  const startListening = useCallback(
    (stream: MediaStream) => {
      if (
        !analyserCtxRef.current ||
        analyserCtxRef.current.state === "closed"
      ) {
        analyserCtxRef.current = new AudioContext();
      }
      const ctx = analyserCtxRef.current;
      try {
        audioSourceRef.current?.disconnect();
      } catch {}
      try {
        analyserNodeRef.current?.disconnect();
      } catch {}

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);
      audioSourceRef.current = source;
      analyserNodeRef.current = analyser;
      freqDataRef.current = new Uint8Array(analyser.frequencyBinCount);

      startBarAnimation("listening");
    },
    [startBarAnimation],
  );

  const stopVisualization = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    barModeRef.current = null;
    try {
      audioSourceRef.current?.disconnect();
    } catch {}
    try {
      analyserNodeRef.current?.disconnect();
    } catch {}
    audioSourceRef.current = null;
    analyserNodeRef.current = null;
    freqDataRef.current = null;
    barsRef.current = new Array(DISPLAY_BARS).fill(0);
    scrollRef.current = { lastSampleAt: 0, frac: 0, peak: 0 };
    volumeRef.current = 0;
  }, []);

  // ---- Hide pill ----
  const hidePill = useCallback(() => {
    setPillState("idle");
    setPendingCount(0);
    wantsMicRef.current = false;
    pillActiveRef.current = false;
    queueRef.current = [];
    drainingRef.current = false;
    drainAgainRef.current = false;
    recordingActiveRef.current = false;
    streamResolverRef.current = null;
    pendingReRecordRef.current = false;
    stopVisualization();
    window.api.hidePill();
  }, [stopVisualization, setPillState]);

  const resumeTranscribingOrHide = useCallback(() => {
    if (isTranscriptionIdle()) {
      hidePill();
    } else {
      setPillState("transcribing");
      startBarAnimation("speaking");
      void drainQueue();
    }
  }, [
    hidePill,
    setPillState,
    startBarAnimation,
    drainQueue,
    isTranscriptionIdle,
  ]);

  // Restore the system volume, but only after any in-flight duck has settled
  // so the restore can't be a no-op that leaves the volume stuck low.
  const restoreSystemAudioSafely = useCallback(async (): Promise<void> => {
    try {
      await duckingPromiseRef.current;
      await window.api?.restoreSystemAudio();
    } catch {}
  }, []);

  // ---- Start recording ----
  const startRecording = useCallback(
    async (forReRecord = false) => {
      if (wantsMicRef.current) {
        return;
      }
      wantsMicRef.current = true;
      pillActiveRef.current = true;
      pendingCommitRef.current = false;

      // Warm the pipeline while the user is speaking so submission doesn't pay
      // startup latency: the local ASR server (whisper/mlx) model load and the
      // cloud cleanup LLM connection (e.g. Groq TLS handshake). Fire-and-forget:
      // the server decides what needs warming (no-op where nothing applies), and
      // lazy start at submission remains the fallback if this doesn't land.
      void getClient()
        .api.transcribe["pre-warm"].$post()
        .catch(() => {});

      appContextRef.current = null;
      // Streaming is always active — prime the streamer's context.
      try {
        getStreamer().setContext(null);
      } catch {}

      void refreshNeedsAppContextForCleanup().then((needsAppContext) => {
        if (!needsAppContext || !wantsMicRef.current) return;
        void window.api
          ?.getFrontmostApp()
          .then((app) => {
            if (!wantsMicRef.current) return;
            appContextRef.current = app;
            try {
              getStreamer().setContext(app);
            } catch {}
          })
          .catch(() => {
            if (!wantsMicRef.current) return;
            appContextRef.current = null;
            try {
              getStreamer().setContext(null);
            } catch {}
          });
      });

      setPillState("initializing");
      startBarAnimation("connecting");

      // Play the start cue immediately, before ducking lowers the system
      // volume — otherwise the tone is attenuated to DUCKED_VOLUME and is
      // effectively inaudible.
      playTone("start");

      // Duck/pause system audio concurrently with mic acquisition. The pause
      // path can spawn a slow media-control subprocess; awaiting it before
      // getUserMedia is what made the "initializing" state drag on. Restores
      // go through restoreSystemAudioSafely(), which waits on this promise so a
      // cancel can't race the duck.
      duckingPromiseRef.current =
        _audioPlaybackMode !== "off"
          ? window.api?.prepareSystemAudio(_audioPlaybackMode).catch(() => {})
          : undefined;

      try {
        recordingSessionUsesTransportRef.current =
          supportsSessionTransportRef.current;

        // When session transport is active the streamer handles audio capture
        // directly — we only need the raw mic stream for the analyser. When
        // it's not (batch path), start the MediaRecorder so we get a WAV.
        const stream = recordingSessionUsesTransportRef.current
          ? await recorderRef.current.acquireStream()
          : await recorderRef.current.start();

        if (!wantsMicRef.current) {
          recorderRef.current.cancel();
          recorderRef.current.releaseStream();
          void restoreSystemAudioSafely();
          streamerRef.current?.cancel();
          if (forReRecord) {
            resumeTranscribingOrHide();
          }
          return;
        }
        if (pendingCommitRef.current) {
          pendingCommitRef.current = false;
          wantsMicRef.current = false;
          recorderRef.current.cancel();
          recorderRef.current.releaseStream();
          void restoreSystemAudioSafely();
          streamerRef.current?.cancel();
          if (forReRecord) {
            resumeTranscribingOrHide();
          } else {
            hidePill();
          }
          return;
        }

        setPillState("recording");
        recordingActiveRef.current = true;
        startTimeRef.current = Date.now();

        startListening(stream);
        try {
          await getStreamer().startCapture(stream);
        } catch {}
      } catch (err) {
        pendingCommitRef.current = false;
        recorderRef.current.releaseStream();
        void restoreSystemAudioSafely();
        hidePill();
        window.api.showErrorDialog(
          "Recording Failed",
          err instanceof Error ? err.message : "Mic access denied",
        );
      }
    },
    [
      startBarAnimation,
      startListening,
      hidePill,
      getStreamer,
      setPillState,
      resumeTranscribingOrHide,
      restoreSystemAudioSafely,
    ],
  );

  // ---- Commit recording ----
  const commitRecording = useCallback(async () => {
    wantsMicRef.current = false;
    recordingActiveRef.current = false;

    // Restore the system volume first, then play the stop cue so it isn't
    // muted by ducking. Fire-and-forget so the transcription pipeline below
    // isn't blocked on the restore. This runs on every commit path, so the
    // branches below don't restore again. Gate on whether this session ducked
    // (not the current mode setting, which can change mid-recording) so a
    // toggle to "off" while recording can't strand the volume low.
    void (async () => {
      if (duckingPromiseRef.current) {
        await restoreSystemAudioSafely();
      }
      playTone("stop");
    })();

    try {
      audioSourceRef.current?.disconnect();
    } catch {}
    try {
      analyserNodeRef.current?.disconnect();
    } catch {}
    audioSourceRef.current = null;
    analyserNodeRef.current = null;
    freqDataRef.current = null;

    const recordingDuration = Date.now() - startTimeRef.current;
    if (recordingDuration < 250) {
      recorderRef.current.cancel();
      recorderRef.current.releaseStream();
      streamerRef.current?.cancel();
      window.api?.sendRecordingCancelled();
      resumeTranscribingOrHide();
      return;
    }

    window.api?.sendRecordingCommitted();
    setPillState("transcribing");
    startBarAnimation("speaking");

    // Streaming session transport path: the streamer already has the audio —
    // commit it over the WebSocket and wait for the server's final message.
    if (recordingSessionUsesTransportRef.current && streamerRef.current) {
      recorderRef.current.cancel();
      recorderRef.current.releaseStream();

      setPendingCount((c) => c + 1);
      const transcribePromise = new Promise<TranscribeResult>((resolve) => {
        streamResolverRef.current = resolve;
        // Server-side commit timeouts fire at 12s; if no final arrived by
        // 15s the stream is dead — salvage via REST with the recorded WAV.
        setTimeout(() => {
          if (streamResolverRef.current === resolve) {
            streamResolverRef.current = null;
            const fallback = restFallbackTranscribe("Transcription timed out");
            if (fallback) {
              void fallback.then(resolve);
            } else {
              resolve({
                raw: "",
                cleaned: "",
                error: "Transcription timed out",
              });
            }
          }
        }, 15_000);
      });
      streamerRef.current.commit();
      queueRef.current.push({
        promise: transcribePromise.finally(() => {
          setPendingCount((c) => Math.max(0, c - 1));
          // Replay a re-record press that arrived while this commit was
          // finalizing (see the hotkey-down handler). Only when nothing else
          // has already taken the mic.
          if (pendingReRecordRef.current && !wantsMicRef.current) {
            pendingReRecordRef.current = false;
            void startRecording(true);
          }
        }),
      });
      void drainQueue();
      return;
    }

    const wavBlob = recorderRef.current.isRecording()
      ? await recorderRef.current.stop()
      : null;
    recorderRef.current.releaseStream();

    if (!pillActiveRef.current) {
      return;
    }

    if (!wavBlob) {
      if (isTranscriptionIdle()) {
        hidePill();
        window.api.showErrorDialog(
          "Recording Failed",
          "No audio captured. Try recording again.",
        );
      } else {
        resumeTranscribingOrHide();
      }
      return;
    }

    const isSubsequent = queueRef.current.length > 0 || drainingRef.current;
    const headers: Record<string, string> = {
      "Content-Type": "audio/wav",
      "x-audio-duration-ms": String(recordingDuration),
    };
    if (appContextRef.current)
      headers["x-app-context"] = encodeAppContext(appContextRef.current);
    if (isSubsequent) headers["x-skip-post-process"] = "true";

    const serverOk = await refreshApiBase();
    if (!serverOk) {
      hidePill();
      window.api.showErrorDialog(
        "Server Unreachable",
        isRemoteServer()
          ? `Cannot reach the server at ${getApiBase()}. Check the server URL in Settings → Network, or reset to the local server.`
          : `Cannot reach Freestyle server at ${getApiBase()}. Quit and reopen the app.`,
      );
      return;
    }

    setPendingCount((c) => c + 1);
    const transcribePromise: Promise<TranscribeResult> = apiFetch(
      "/api/transcribe",
      { method: "POST", body: wavBlob, headers },
    )
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: string;
            detail?: string;
          } | null;
          if (res.status === 401 && body?.error === "cloud_auth_required") {
            return {
              raw: "",
              cleaned: "",
              error: "Sign in to Freestyle Transcribe",
              cloudAuthRequired: true,
            };
          }
          if (res.status === 429 && body?.error === "usage_exceeded") {
            return {
              raw: "",
              cleaned: "",
              error: USAGE_LIMIT_DIALOG_MESSAGE,
              usageExceeded: true,
            };
          }
          const msg =
            body?.detail ||
            body?.error ||
            `Transcription failed (${res.status})`;
          return { raw: "", cleaned: "", error: msg };
        }
        const data = (await res.json()) as {
          raw?: string;
          cleaned?: string;
          provider_category?: string;
          disposition?: "deliver" | "suppressed" | "aborted";
        };
        return {
          raw: (data.raw || "").trim(),
          cleaned: (data.cleaned || data.raw || "").trim(),
          providerCategory: data.provider_category,
          disposition: data.disposition,
        };
      })
      .catch((err) => {
        const msg = err instanceof Error ? err.message : "Transcription failed";
        const hint =
          msg.includes("fetch") || msg.includes("Failed")
            ? isRemoteServer()
              ? ` (${getApiBase()} unreachable — check Settings → Network)`
              : ` (${getApiBase()} unreachable — quit and reopen the app)`
            : "";
        return { raw: "", cleaned: "", error: `${msg}${hint}` };
      })
      .finally(() => {
        setPendingCount((c) => Math.max(0, c - 1));
      });

    queueRef.current.push({ promise: transcribePromise });
    drainQueue();
  }, [
    hidePill,
    drainQueue,
    startBarAnimation,
    setPillState,
    resumeTranscribingOrHide,
    isTranscriptionIdle,
    restoreSystemAudioSafely,
    restFallbackTranscribe,
    startRecording,
  ]);

  // ---- Cancel ----
  const cancelRecording = useCallback(() => {
    recorderRef.current.cancel();
    recorderRef.current.releaseStream();
    void restoreSystemAudioSafely();
    streamerRef.current?.cancel();
    window.api?.sendRecordingCancelled();
    hidePill();
  }, [hidePill, restoreSystemAudioSafely]);

  // ---- Preferences ----
  const applyPillPosition = useCallback((pos: string | null | undefined) => {
    const isTop =
      pos === "top-center" || pos === "top-right" || pos === "custom-top";
    setPillAlign(isTop ? "start" : "end");
    setPillSide(pos?.endsWith("right") ? "right" : "center");
  }, []);

  useEffect(() => {
    // Read every persisted preference in a single request instead of one GET
    // per key. Missing keys are simply absent from the map (no 404s), and the
    // legacy audio-playback fallbacks read from the same snapshot.
    getClient()
      .api.settings.$get()
      .then((r) => (r.ok ? r.json() : null))
      .then((settings) => {
        if (!settings) return;

        if (settings[SETTINGS_KEYS.soundEnabled] === "false") {
          _soundEnabled = false;
        }

        const mode = settings.audio_playback_mode;
        if (mode) {
          _audioPlaybackMode = normalizeAudioPlaybackMode(mode);
        } else if (settings.pause_playback_while_recording === "true") {
          _audioPlaybackMode = "pause";
        } else {
          _audioPlaybackMode =
            settings.audio_ducking_enabled === "true" ? "duck" : "off";
        }

        const outputMode = settings[SETTINGS_KEYS.outputMode];
        if (outputMode) _outputMode = outputMode;

        // Warm the cleanup-context cache from the same snapshot instead of
        // firing a second GET /api/settings.
        applyNeedsAppContextForCleanup(settings);
      })
      .catch(() => {});

    // Streaming is always active. Eagerly create the Streamer so the WebSocket
    // connects and the onConfig callback (which sets supportsSessionTransportRef)
    // fires before the first recording. Session-transport support is negotiated
    // per provider — non-streaming providers fall back to the batch path.
    getStreamer();
    window.api
      ?.getPillPosition()
      .then(applyPillPosition)
      .catch(() => {});
    // Prime the `beforeOutput` hook-presence cache so the very first dictation's
    // delivery already applies the correct fail-closed policy.
    void refreshBeforeOutputHookPresence();

    // Listen for live changes from the settings UI
    const removePillPos = window.api?.onPillPositionChanged(applyPillPosition);
    const removeOutputMode = window.api?.onOutputModeChanged((mode) => {
      _outputMode = mode;
    });
    const removeAudioDucking = window.api?.onAudioDuckingChanged((enabled) => {
      _audioPlaybackMode = enabled ? "duck" : "off";
    });
    const removeAudioPlaybackMode = window.api?.onAudioPlaybackModeChanged(
      (mode) => {
        _audioPlaybackMode = normalizeAudioPlaybackMode(mode);
      },
    );
    // The server target (URL/token) changed in Settings. Re-point this window's
    // API client and tear down the streamer so its next connection uses the new
    // server — no app restart needed. A fresh streamer is created immediately so
    // session-transport support is renegotiated before the next recording.
    const removeServerChanged = window.api?.onServerChanged(() => {
      void refreshApiBase().finally(() => {
        streamerRef.current?.destroy();
        streamerRef.current = null;
        supportsSessionTransportRef.current = false;
        getStreamer();
      });
    });
    return () => {
      removePillPos?.();
      removeOutputMode?.();
      removeAudioDucking?.();
      removeAudioPlaybackMode?.();
      removeServerChanged?.();
    };
  }, [applyPillPosition, getStreamer]);

  // ---- Hotkey handlers ----
  useEffect(() => {
    const removeDown = window.api.onHotkeyDown(() => {
      // hidePill() clears pillActiveRef before React re-renders idle state.
      if (!pillActiveRef.current) {
        stateRef.current = "idle";
      }
      const s = stateRef.current;
      if (s === "idle") {
        startRecording(false);
      } else if (s === "transcribing" && !wantsMicRef.current) {
        if (isTranscriptionIdle()) {
          hidePill();
          return;
        }
        // A pending streaming commit owns the single WebSocket + PCM buffer,
        // so a second streaming session can't run alongside it. Defer the
        // re-record until the commit resolves rather than dropping the press.
        if (streamResolverRef.current !== null) {
          pendingReRecordRef.current = true;
          return;
        }
        // A previous batch transcription is still in flight; start a new
        // recording alongside it. Its result is queued and drained normally.
        void startRecording(true);
      }
    });
    const removeUp = window.api.onHotkeyUp(() => {
      if (!pillActiveRef.current) return;
      if (stateRef.current === "recording") {
        commitRecording();
      } else if (stateRef.current === "initializing") {
        pendingCommitRef.current = true;
      } else if (
        stateRef.current === "transcribing" &&
        !wantsMicRef.current &&
        isTranscriptionIdle()
      ) {
        hidePill();
      }
    });
    const removeCancel = window.api.onPillCancel(() => {
      if (stateRef.current !== "idle") cancelRecording();
    });
    return () => {
      removeDown();
      removeUp();
      removeCancel();
    };
  }, [
    startRecording,
    commitRecording,
    cancelRecording,
    hidePill,
    isTranscriptionIdle,
  ]);

  // ---- Cleanup on unmount ----
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      setTimeout(() => {
        if (!mountedRef.current) {
          cancelRecording();
          recorderRef.current.destroy();
          streamerRef.current?.destroy();
          streamerRef.current = null;
        }
      }, 0);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancelRecording]);

  // ---- Render ----
  // State is carried entirely by the waveform's brightness — no coloured glow,
  // no chrome. Recording is the only fully-lit state; everything else recedes.
  const barColor =
    state === "recording" ? "#F5F1E4" : "rgba(245, 241, 228, 0.62)";

  // Only worth showing when more than one dictation is stacked up; a single
  // in-flight transcription is already implied by the sweeping waveform.
  const badge = pendingCount > 1 ? String(pendingCount) : null;

  const renderBars = (ref?: React.RefObject<SVGSVGElement | null>) => (
    <svg
      ref={ref}
      width={SVG_WIDTH}
      height={SVG_HEIGHT}
      viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
      style={
        {
          display: "block",
          flexShrink: 0,
          WebkitAppRegion: "no-drag",
        } as React.CSSProperties
      }
      role="img"
      aria-label="Audio levels"
    >
      <g ref={barsGroupRef}>
        {Array.from({ length: DISPLAY_BARS }, (_, i) => {
          // Shifted one pitch left so index 0 is the off-screen spare and
          // index 1 is the first bar actually inside the viewBox.
          const x = BAR_PITCH * (i + 0.5) - BAR_PITCH;
          return (
            <line
              key={i}
              x1={x}
              y1={SVG_HEIGHT / 2 + BAR_WIDTH / 2}
              x2={x}
              y2={SVG_HEIGHT / 2 - BAR_WIDTH / 2}
              stroke={barColor}
              strokeWidth={BAR_WIDTH}
              strokeLinecap="round"
              style={{ opacity: 0.32, transition: "stroke 220ms ease" }}
            />
          );
        })}
      </g>
    </svg>
  );

  return (
    <div
      className={`flex h-screen w-screen select-none ${
        pillAlign === "start" ? "items-start" : "items-end"
      } ${pillSide === "right" ? "justify-end pr-3" : "justify-center"}`}
    >
      <style>
        {`
          @keyframes pill-in {
            from { opacity: 0; transform: translateY(6px) scale(0.88); }
            to   { opacity: 1; transform: translateY(0)   scale(1); }
          }
          .pill-in {
            animation: pill-in 280ms cubic-bezier(0.22, 1, 0.36, 1) both;
          }
          @media (prefers-reduced-motion: reduce) {
            .pill-in { animation-duration: 1ms; }
          }
        `}
      </style>

      {state !== "idle" && (
        <div
          className="pill-in inline-flex items-center justify-center gap-1.5"
          style={{
            ...pillInnerStyle,
            width: badge ? PILL_WIDTH + PILL_BADGE_EXTRA : PILL_WIDTH,
            marginBottom: pillAlign === "end" ? 8 : 0,
            marginTop: pillAlign === "start" ? 8 : 0,
          }}
        >
          {renderBars(barsSvgRef)}

          {badge && (
            <span
              className="mono"
              style={
                {
                  fontSize: 9,
                  lineHeight: 1,
                  letterSpacing: "0.04em",
                  color: "rgba(245, 241, 228, 0.55)",
                  flexShrink: 0,
                  // Restore pointer events on the badge label.
                  WebkitAppRegion: "no-drag",
                } as React.CSSProperties
              }
            >
              {badge}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
