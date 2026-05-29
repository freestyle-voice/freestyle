import {
  isBinaryAvailable,
  isServerBinaryAvailable,
} from "../../whisper/binary.js";
import { WHISPER_PROVIDER_ID } from "../../whisper/constants.js";
import { ensureBinariesDownloaded } from "../../whisper/models.js";
import {
  getServerPort,
  isServerRunning,
  startInBackground,
} from "../../whisper/server.js";
import { transcribeWithWhisper } from "../../whisper/transcribe.js";
import type {
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
    const isDev = process.env.NODE_ENV !== "production";

    if (
      !isBinaryAvailable() &&
      !isServerBinaryAvailable() &&
      !isServerRunning()
    ) {
      await ensureBinariesDownloaded();
    }

    if (isDev) {
      console.log(
        `[whisper] transcribe: serverRunning=${isServerRunning()} serverBinary=${isServerBinaryAvailable()} cli=${isBinaryAvailable()}`,
      );
    }

    if (isServerRunning()) {
      try {
        const t0 = Date.now();
        const result = await transcribeViaServer(opts.audio, getServerPort());
        if (isDev) {
          console.log(`[whisper] server inference took ${Date.now() - t0}ms`);
        }
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
      if (isDev) {
        console.log(`[whisper] CLI inference took ${Date.now() - t0}ms`);
      }

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
    return false;
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
