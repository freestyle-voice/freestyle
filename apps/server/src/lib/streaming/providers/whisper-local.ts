import { Buffer } from "node:buffer";
import {
  isBinaryAvailable,
  isServerBinaryAvailable,
} from "../../whisper/binary.js";
import { WHISPER_PROVIDER_ID } from "../../whisper/constants.js";
import { getDownloadedModelPath } from "../../whisper/models.js";
import {
  ensureServerRunning,
  getServerPort,
  isServerRunning,
} from "../../whisper/server.js";
import { transcribeWithWhisper } from "../../whisper/transcribe.js";
import type {
  StreamingSessionOptions,
  StreamSession,
  TranscribeOptions,
  TranscribeResult,
  TranscriptionProvider,
} from "../types.js";
import { stripProviderPrefix } from "../types.js";

export class WhisperLocalTranscriptionProvider
  implements TranscriptionProvider
{
  readonly providerId = WHISPER_PROVIDER_ID;

  async transcribe(opts: TranscribeOptions): Promise<TranscribeResult> {
    const modelId = stripProviderPrefix(opts.model);

    if (isBinaryAvailable()) {
      return transcribeWithWhisper({
        audio: opts.audio,
        modelId,
        language: opts.language,
      });
    }

    if (isServerBinaryAvailable() || isServerRunning()) {
      await ensureServerRunning(modelId);
      return transcribeViaServer(opts.audio, getServerPort());
    }

    throw new Error(
      "whisper.cpp binary not found. Run 'pnpm download:whisper-cpp' in the electron app directory.",
    );
  }

  supportsStreaming(modelId: string): boolean {
    if (!isServerBinaryAvailable()) return false;
    const id = stripProviderPrefix(modelId);
    return getDownloadedModelPath(id) !== null;
  }

  openStreamingSession(opts: StreamingSessionOptions): StreamSession {
    const { model, callbacks } = opts;
    const modelId = stripProviderPrefix(model);
    let closed = false;
    let commitRequested = false;
    let serverReady = false;
    const audioChunks: Buffer[] = [];

    const port = getServerPort();
    const inferenceUrl = `http://127.0.0.1:${port}/inference`;

    ensureServerRunning(modelId)
      .then(() => {
        if (closed) return;
        serverReady = true;
        callbacks.onReady(modelId);

        if (commitRequested) {
          doInference();
        }
      })
      .catch((err) => {
        if (closed) return;
        callbacks.onError(err instanceof Error ? err.message : String(err));
      });

    async function doInference(): Promise<void> {
      commitRequested = false;

      if (audioChunks.length === 0) {
        callbacks.onFinal("");
        return;
      }

      const combined = Buffer.concat(audioChunks);
      audioChunks.length = 0;

      const wavHeader = buildWavHeader(combined.length, 16000, 1, 16);
      const wavBuffer = Buffer.concat([wavHeader, combined]);

      try {
        const form = new FormData();
        form.append(
          "file",
          new Blob([wavBuffer], { type: "audio/wav" }),
          "audio.wav",
        );
        form.append("response_format", "json");

        const res = await fetch(inferenceUrl, {
          method: "POST",
          body: form,
          signal: AbortSignal.timeout(120_000),
        });

        if (!res.ok) {
          const detail = await res.text().catch(() => "");
          callbacks.onError(
            `Whisper inference failed: HTTP ${res.status} ${detail}`,
          );
          return;
        }

        const data = (await res.json()) as { text?: string };
        const text = data.text?.trim() ?? "";
        callbacks.onFinal(text);
      } catch (err) {
        callbacks.onError(err instanceof Error ? err.message : String(err));
      }
    }

    return {
      sendAudio(chunk: ArrayBuffer): void {
        if (closed) return;
        audioChunks.push(Buffer.from(chunk));
      },
      commit(): void {
        if (closed) return;
        commitRequested = true;
        if (serverReady) {
          doInference();
        }
      },
      cancel(): void {
        closed = true;
        audioChunks.length = 0;
      },
      close(): void {
        closed = true;
        audioChunks.length = 0;
      },
    };
  }
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

function buildWavHeader(
  dataSize: number,
  sampleRate: number,
  channels: number,
  bitsPerSample: number,
): Buffer {
  const blockAlign = (channels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const headerSize = 44;

  const buf = Buffer.alloc(headerSize);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(dataSize + headerSize - 8, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); // PCM chunk size
  buf.writeUInt16LE(1, 20); // PCM format
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(byteRate, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(bitsPerSample, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(dataSize, 40);
  return buf;
}
