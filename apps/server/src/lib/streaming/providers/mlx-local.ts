import { createAppLogger } from "@freestyle-voice/utils";
import { collapseAsrLineBreaks } from "../../editor/model-hints.js";
import { MLX_ASR_PROVIDER_ID } from "../../mlx-asr/constants.js";
import { resolveMlxLanguage } from "../../mlx-asr/language.js";
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

const log = createAppLogger("mlx-asr");
const STREAM_SAMPLE_RATE = 16_000;

export class MlxLocalTranscriptionProvider implements TranscriptionProvider {
  readonly providerId = MLX_ASR_PROVIDER_ID;

  async transcribe(opts: TranscribeOptions): Promise<TranscribeResult> {
    const modelId = stripProviderPrefix(opts.model);

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
      language: resolveMlxLanguage(modelId, opts.language),
      context: opts.bias?.kind === "prompt" ? opts.bias.text : undefined,
    });

    log.debug(`inference took ${Date.now() - t0}ms`);

    return { text: collapseAsrLineBreaks(text).trim() };
  }

  supportsStreaming(_modelId: string): boolean {
    return false;
  }

  supportsSessionTransport(_modelId: string): boolean {
    return true;
  }

  openStreamingSession(opts: StreamingSessionOptions): StreamSession {
    const modelId = stripProviderPrefix(opts.model);
    return new MlxLocalSessionTransport({
      modelId,
      language: resolveMlxLanguage(modelId, opts.language),
      context: opts.bias?.kind === "prompt" ? opts.bias.text : undefined,
      callbacks: opts.callbacks,
    });
  }
}

class MlxLocalSessionTransport implements StreamSession {
  private chunks: Buffer[] = [];
  private sampleCount = 0;
  private closed = false;
  private canceled = false;
  private inFlight = false;
  private committed = false;
  private generation = 0;
  private workerReadyPromise: Promise<void> = Promise.resolve();

  constructor(
    private readonly opts: {
      modelId: string;
      language?: string;
      context?: string;
      callbacks: StreamCallbacks;
    },
  ) {
    this.startWorkerLoad();
  }

  sendAudio(chunk: ArrayBuffer): void {
    if (this.closed || this.canceled) return;
    const buf = Buffer.from(chunk);
    this.chunks.push(buf);
    this.sampleCount += Math.floor(buf.byteLength / 2);
  }

  reset(): void {
    this.chunks = [];
    this.sampleCount = 0;
    this.canceled = false;
    this.inFlight = false;
    this.committed = false;
    this.generation++;
    this.startWorkerLoad();
  }

  waitUntilReady(): Promise<void> {
    return this.workerReadyPromise;
  }

  commit(): void {
    if (this.committed || this.inFlight) return;
    this.committed = true;
    this.runInference();
  }

  cancel(): void {
    this.canceled = true;
    this.chunks = [];
    this.sampleCount = 0;
    this.committed = false;
    this.generation++;
    applyMlxAsrRetentionPolicy();
  }

  close(): void {
    this.closed = true;
    this.cancel();
    applyMlxAsrRetentionPolicy();
  }

  /** Batch-only session transport: load the MLX worker while audio is captured. */
  private startWorkerLoad(): void {
    if (getMlxModelStatus(this.opts.modelId)?.status !== "ready") {
      this.workerReadyPromise = Promise.reject(
        new Error("MLX ASR model is not downloaded yet."),
      );
      this.workerReadyPromise.catch(() => undefined);
      this.opts.callbacks.onError("MLX ASR model is not downloaded yet.");
      return;
    }

    const generation = this.generation;
    this.workerReadyPromise = ensureMlxServerRunning(this.opts.modelId).then(
      () => {
        if (this.closed || this.canceled || generation !== this.generation) {
          return;
        }
        this.opts.callbacks.onReady(this.opts.modelId);
      },
    );
    this.workerReadyPromise.catch((err: Error) => {
      if (this.closed || generation !== this.generation) return;
      this.opts.callbacks.onError(err.message);
    });
  }

  private runInference(): void {
    if (this.closed || this.canceled) return;
    if (this.inFlight) return;

    if (this.sampleCount === 0) {
      this.opts.callbacks.onFinal("");
      return;
    }
    if (getMlxModelStatus(this.opts.modelId)?.status !== "ready") {
      this.opts.callbacks.onError("MLX ASR model is not downloaded yet.");
      return;
    }

    const generation = this.generation;
    const audio = Buffer.concat(this.chunks);
    this.inFlight = true;

    void this.workerReadyPromise
      .then(() => {
        if (this.closed || this.canceled || generation !== this.generation) {
          return;
        }

        return transcribePcmWithMlxAsr({
          modelId: this.opts.modelId,
          pcm: new Uint8Array(audio),
          sampleRate: STREAM_SAMPLE_RATE,
          language: this.opts.language,
          context: this.opts.context,
          deferUnload: true,
        });
      })
      .then((text) => {
        if (text === undefined) return;
        if (this.closed || this.canceled || generation !== this.generation) {
          return;
        }
        this.opts.callbacks.onFinal(collapseAsrLineBreaks(text).trim());
        applyMlxAsrRetentionPolicy();
      })
      .catch((err: Error) => {
        if (this.closed || generation !== this.generation) return;
        this.opts.callbacks.onError(err.message);
      })
      .finally(() => {
        if (this.closed || this.canceled || generation !== this.generation) {
          if (this.closed || this.canceled) {
            applyMlxAsrRetentionPolicy();
          }
          return;
        }
        this.inFlight = false;
      });
  }
}
