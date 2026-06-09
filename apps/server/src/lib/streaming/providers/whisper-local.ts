import { createAppLogger } from "@freestyle/utils";
import {
  isBinaryAvailable,
  isServerBinaryAvailable,
} from "../../whisper/binary.js";
import { WHISPER_PROVIDER_ID } from "../../whisper/constants.js";
import {
  ensureBinariesDownloaded,
  getDownloadedModelPath,
} from "../../whisper/models.js";
import { encodePcmS16leToWav } from "../../whisper/pcm-wav.js";
import {
  ensureServerRunning,
  getServerPort,
  isServerRunning,
  startInBackground,
} from "../../whisper/server.js";
import { transcribeWithWhisper } from "../../whisper/transcribe.js";
import type {
  StreamCallbacks,
  StreamingSessionOptions,
  StreamSession,
  TranscribeOptions,
  TranscribeResult,
  TranscriptionProvider,
} from "../types.js";
import { stripProviderPrefix } from "../types.js";

const log = createAppLogger("whisper");
const STREAM_SAMPLE_RATE = 16_000;
const PARTIAL_INTERVAL_MS = 2_000;
const MIN_PARTIAL_AUDIO_MS = 1_000;

export class WhisperLocalTranscriptionProvider
  implements TranscriptionProvider
{
  readonly providerId = WHISPER_PROVIDER_ID;

  async transcribe(opts: TranscribeOptions): Promise<TranscribeResult> {
    const modelId = stripProviderPrefix(opts.model);

    if (
      !isBinaryAvailable() &&
      !isServerBinaryAvailable() &&
      !isServerRunning()
    ) {
      try {
        await ensureBinariesDownloaded();
      } catch (err) {
        throw new Error(
          `whisper.cpp binary not found and automatic setup failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    log.debug(
      `transcribe: serverRunning=${isServerRunning()} serverBinary=${isServerBinaryAvailable()} cli=${isBinaryAvailable()}`,
    );

    if (isServerRunning()) {
      try {
        const t0 = Date.now();
        const result = await transcribeViaServer(opts.audio, getServerPort());
        log.debug(`server inference took ${Date.now() - t0}ms`);
        return result;
      } catch {
        // fall through to CLI
      }
    }

    if (isBinaryAvailable()) {
      const t0 = Date.now();
      const result = await transcribeWithWhisper({
        audio: opts.audio,
        modelId,
        language: opts.language,
      });
      log.debug(`CLI inference took ${Date.now() - t0}ms`);

      if (isServerBinaryAvailable() && !isServerRunning()) {
        startInBackground(modelId);
      }

      return result;
    }

    throw new Error(
      "whisper.cpp binary not found. The build may have failed — check the logs above.",
    );
  }

  supportsStreaming(_modelId: string): boolean {
    return true;
  }

  openStreamingSession(opts: StreamingSessionOptions): StreamSession {
    const modelId = stripProviderPrefix(opts.model);
    return new WhisperLocalStreamingSession({
      modelId,
      language:
        opts.language && opts.language !== "auto" ? opts.language : undefined,
      callbacks: opts.callbacks,
    });
  }
}

class WhisperLocalStreamingSession implements StreamSession {
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
  private workerReadyPromise: Promise<void> = Promise.resolve();

  constructor(
    private readonly opts: {
      modelId: string;
      language?: string;
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

    if (this.audioDurationMs() < MIN_PARTIAL_AUDIO_MS) return;
    this.schedulePartial();
  }

  reset(): void {
    this.clearTimer();
    if (this.inFlight && this.commitRequested) {
      this.opts.callbacks.onFinal(this.lastText);
    }
    this.chunks = [];
    this.sampleCount = 0;
    this.canceled = false;
    this.inFlight = false;
    this.dirty = false;
    this.commitRequested = false;
    this.lastText = "";
    this.generation++;
    this.startWorkerLoad();
  }

  waitUntilReady(): Promise<void> {
    return this.workerReadyPromise;
  }

  commit(): void {
    this.clearTimer();
    this.commitRequested = true;
    if (
      !this.inFlight &&
      !this.lastText &&
      this.audioDurationMs() >= MIN_PARTIAL_AUDIO_MS
    ) {
      this.runInference(false);
      return;
    }
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
  }

  private startWorkerLoad(): void {
    if (!getDownloadedModelPath(this.opts.modelId)) {
      this.workerReadyPromise = Promise.reject(
        new Error(
          `Whisper model "${this.opts.modelId}" is not downloaded. Download it from Settings > Models.`,
        ),
      );
      this.workerReadyPromise.catch(() => undefined);
      this.opts.callbacks.onError(
        `Whisper model "${this.opts.modelId}" is not downloaded yet.`,
      );
      return;
    }

    const generation = this.generation;
    this.workerReadyPromise = this.ensureWhisperReady().then(() => {
      if (this.closed || this.canceled || generation !== this.generation) {
        return;
      }
      this.opts.callbacks.onReady(this.opts.modelId);
      this.runReadyPreview(generation);
    });
    this.workerReadyPromise.catch((err: Error) => {
      if (this.closed || generation !== this.generation) return;
      this.opts.callbacks.onError(err.message);
    });
  }

  private async ensureWhisperReady(): Promise<void> {
    if (
      !isBinaryAvailable() &&
      !isServerBinaryAvailable() &&
      !isServerRunning()
    ) {
      await ensureBinariesDownloaded();
    }
    if (isServerBinaryAvailable() || isServerRunning()) {
      await ensureServerRunning(this.opts.modelId);
      return;
    }
    if (!isBinaryAvailable()) {
      throw new Error(
        "whisper.cpp binary not found. The build may have failed — check the logs above.",
      );
    }
  }

  private schedulePartial(): void {
    if (this.closed || this.canceled || this.commitRequested) return;
    if (this.partialTimer) return;
    this.partialTimer = setTimeout(() => {
      this.partialTimer = null;
      this.runInference(false);
    }, PARTIAL_INTERVAL_MS);
  }

  private runReadyPreview(generation: number): void {
    if (
      this.closed ||
      this.canceled ||
      this.inFlight ||
      this.lastText ||
      generation !== this.generation ||
      this.audioDurationMs() < MIN_PARTIAL_AUDIO_MS
    ) {
      return;
    }
    this.clearTimer();
    this.runInference(false);
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

    const generation = this.generation;
    const pcm = Buffer.concat(this.chunks);
    this.inFlight = true;
    this.dirty = false;

    void this.workerReadyPromise
      .then(() => {
        if (this.closed || this.canceled || generation !== this.generation) {
          return;
        }
        return transcribeBufferedPcm({
          pcm,
          modelId: this.opts.modelId,
          language: this.opts.language,
        });
      })
      .then((text) => {
        if (text === undefined) return;
        if (this.closed || this.canceled || generation !== this.generation) {
          return;
        }
        const cleanText = text.trim();
        if (final) {
          this.lastText = cleanText;
          this.opts.callbacks.onFinal(cleanText);
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

async function transcribeBufferedPcm(opts: {
  pcm: Buffer;
  modelId: string;
  language?: string;
}): Promise<string> {
  const wav = encodePcmS16leToWav(opts.pcm);
  const audio = new Uint8Array(wav);

  if (isServerRunning()) {
    try {
      const result = await transcribeViaServer(audio, getServerPort());
      return result.text;
    } catch {
      // fall through
    }
  }

  if (isServerBinaryAvailable()) {
    await ensureServerRunning(opts.modelId);
    try {
      const result = await transcribeViaServer(audio, getServerPort());
      return result.text;
    } catch {
      // fall through
    }
  }

  if (isBinaryAvailable()) {
    const result = await transcribeWithWhisper({
      audio,
      modelId: opts.modelId,
      language: opts.language,
    });
    if (isServerBinaryAvailable() && !isServerRunning()) {
      startInBackground(opts.modelId);
    }
    return result.text;
  }

  throw new Error(
    "whisper.cpp binary not found. The build may have failed — check the logs above.",
  );
}

async function transcribeViaServer(
  audio: Uint8Array,
  port: number,
): Promise<TranscribeResult> {
  const form = new FormData();
  const audioBuffer = audio.buffer.slice(
    audio.byteOffset,
    audio.byteOffset + audio.byteLength,
  ) as ArrayBuffer;
  form.append(
    "file",
    new Blob([audioBuffer], { type: "audio/wav" }),
    "audio.wav",
  );
  form.append("response_format", "json");

  const res = await fetch(`http://127.0.0.1:${port}/inference`, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Whisper server inference failed: HTTP ${res.status} ${detail}`,
    );
  }

  const data = (await res.json()) as { text?: string };
  return { text: data.text?.trim() ?? "" };
}
