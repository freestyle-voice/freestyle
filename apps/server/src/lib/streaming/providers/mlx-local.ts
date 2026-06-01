import { MLX_ASR_PROVIDER_ID } from "../../mlx-asr/constants.js";
import { getMlxModelStatus } from "../../mlx-asr/models.js";
import { describeMlxSetupBlocker } from "../../mlx-asr/python.js";
import {
  applyMlxAsrRetentionPolicy,
  canRunMlxAsr,
  ensureMlxServerRunning,
  transcribePcmWithMlxAsr,
  transcribeWithMlxAsr,
} from "../../mlx-asr/server.js";
import type {
  StreamCallbacks,
  StreamingSessionOptions,
  StreamSession,
  TranscribeOptions,
  TranscribeResult,
  TranscriptionProvider,
} from "../types.js";
import { stripProviderPrefix } from "../types.js";

const STREAM_SAMPLE_RATE = 16_000;
const PARTIAL_INTERVAL_MS = 1_500;
const MIN_PARTIAL_AUDIO_MS = 800;

export class MlxLocalTranscriptionProvider implements TranscriptionProvider {
  readonly providerId = MLX_ASR_PROVIDER_ID;

  async transcribe(opts: TranscribeOptions): Promise<TranscribeResult> {
    const modelId = stripProviderPrefix(opts.model);
    const isDev = process.env.NODE_ENV !== "production";

    if (!canRunMlxAsr()) {
      throw new Error(
        describeMlxSetupBlocker() ??
          "MLX ASR is not available. Install the bundled worker or run: pip install mlx-audio",
      );
    }
    if (getMlxModelStatus(modelId)?.status !== "ready") {
      throw new Error("MLX ASR model is not downloaded yet.");
    }

    const t0 = Date.now();
    const text = await transcribeWithMlxAsr({
      modelId,
      audio: opts.audio,
      language: opts.language,
      context: opts.bias?.kind === "prompt" ? opts.bias.text : undefined,
    });

    if (isDev) {
      console.log(`[mlx-asr] inference took ${Date.now() - t0}ms`);
    }

    return { text: text.trim() };
  }

  supportsStreaming(_modelId: string): boolean {
    return true;
  }

  openStreamingSession(opts: StreamingSessionOptions): StreamSession {
    const modelId = stripProviderPrefix(opts.model);
    return new MlxLocalStreamingSession({
      modelId,
      context: opts.bias?.kind === "prompt" ? opts.bias.text : undefined,
      callbacks: opts.callbacks,
    });
  }
}

class MlxLocalStreamingSession implements StreamSession {
  private chunks: Buffer[] = [];
  private sampleCount = 0;
  private closed = false;
  private canceled = false;
  private inFlight = false;
  private dirty = false;
  private commitRequested = false;
  private partialTimer: ReturnType<typeof setTimeout> | null = null;
  private lastText = "";
  private generation = 0;

  constructor(
    private readonly opts: {
      modelId: string;
      context?: string;
      callbacks: StreamCallbacks;
    },
  ) {
    this.prepareWorker();
  }

  sendAudio(chunk: ArrayBuffer): void {
    if (this.closed || this.canceled) return;
    const buf = Buffer.from(chunk);
    this.chunks.push(buf);
    this.sampleCount += Math.floor(buf.byteLength / 2);

    if (this.audioDurationMs() < MIN_PARTIAL_AUDIO_MS) return;
    this.schedulePartial();
  }

  reset(): void {
    this.clearTimer();
    this.chunks = [];
    this.sampleCount = 0;
    this.canceled = false;
    this.inFlight = false;
    this.dirty = false;
    this.commitRequested = false;
    this.lastText = "";
    this.generation++;
    this.prepareWorker();
  }

  commit(): void {
    this.clearTimer();
    this.commitRequested = true;
    this.runInference(true);
  }

  cancel(): void {
    this.canceled = true;
    this.clearTimer();
    this.chunks = [];
    this.sampleCount = 0;
    this.dirty = false;
    this.commitRequested = false;
    this.generation++;
  }

  close(): void {
    this.closed = true;
    this.cancel();
    applyMlxAsrRetentionPolicy();
  }

  private prepareWorker(): void {
    if (getMlxModelStatus(this.opts.modelId)?.status !== "ready") {
      this.opts.callbacks.onError("MLX ASR model is not downloaded yet.");
      return;
    }

    const generation = this.generation;
    ensureMlxServerRunning(this.opts.modelId)
      .then(() => {
        if (this.closed || this.canceled || generation !== this.generation) {
          return;
        }
        this.opts.callbacks.onReady(this.opts.modelId);
      })
      .catch((err: Error) => {
        if (this.closed || generation !== this.generation) return;
        this.opts.callbacks.onError(err.message);
      });
  }

  private schedulePartial(): void {
    if (this.closed || this.canceled || this.commitRequested) return;
    if (this.partialTimer) return;
    this.partialTimer = setTimeout(() => {
      this.partialTimer = null;
      this.runInference(false);
    }, PARTIAL_INTERVAL_MS);
  }

  private runInference(final: boolean): void {
    if (this.closed || this.canceled) return;
    if (this.inFlight) {
      this.dirty = true;
      if (final) this.commitRequested = true;
      return;
    }

    if (this.sampleCount === 0) {
      if (final) this.opts.callbacks.onFinal("");
      return;
    }
    if (getMlxModelStatus(this.opts.modelId)?.status !== "ready") {
      this.opts.callbacks.onError("MLX ASR model is not downloaded yet.");
      return;
    }

    const generation = this.generation;
    const audio = Buffer.concat(this.chunks);
    this.inFlight = true;
    this.dirty = false;

    transcribePcmWithMlxAsr({
      modelId: this.opts.modelId,
      pcm: new Uint8Array(audio),
      sampleRate: STREAM_SAMPLE_RATE,
      context: this.opts.context,
      live: !final,
      deferUnload: true,
      onPartial: final
        ? undefined
        : (text) => this.emitPartial(text, generation),
    })
      .then((text) => {
        if (this.closed || this.canceled || generation !== this.generation) {
          return;
        }
        const cleanText = text.trim();
        if (final) {
          this.lastText = cleanText;
          this.opts.callbacks.onFinal(cleanText);
          applyMlxAsrRetentionPolicy();
          return;
        }
        this.emitPartial(cleanText, generation);
      })
      .catch((err: Error) => {
        if (this.closed || generation !== this.generation) return;
        this.opts.callbacks.onError(err.message);
      })
      .finally(() => {
        if (this.closed || this.canceled || generation !== this.generation) {
          return;
        }
        this.inFlight = false;
        if (this.commitRequested) {
          this.commitRequested = false;
          this.runInference(true);
          return;
        }
        if (this.dirty) {
          this.schedulePartial();
        }
      });
  }

  private emitPartial(text: string, generation: number): void {
    const cleanText = text.trim();
    if (
      !cleanText ||
      cleanText === this.lastText ||
      this.closed ||
      this.canceled ||
      generation !== this.generation
    ) {
      return;
    }
    this.lastText = cleanText;
    this.opts.callbacks.onPartial(cleanText);
  }

  private audioDurationMs(): number {
    return Math.round((this.sampleCount / STREAM_SAMPLE_RATE) * 1000);
  }

  private clearTimer(): void {
    if (!this.partialTimer) return;
    clearTimeout(this.partialTimer);
    this.partialTimer = null;
  }
}
