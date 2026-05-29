import {
  isBinaryAvailable,
  isServerBinaryAvailable,
} from "../../whisper/binary.js";
import { WHISPER_PROVIDER_ID } from "../../whisper/constants.js";
import { ensureBinariesDownloaded } from "../../whisper/models.js";
import {
  ensureServerRunning,
  getServerPort,
  isServerRunning,
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

    if (
      !isBinaryAvailable() &&
      !isServerBinaryAvailable() &&
      !isServerRunning()
    ) {
      await ensureBinariesDownloaded();
    }

    // Prefer whisper-server (model stays loaded in memory, much faster)
    if (isServerRunning() || isServerBinaryAvailable()) {
      try {
        await ensureServerRunning(modelId);
        return await transcribeViaServer(opts.audio, getServerPort());
      } catch {
        // Fall through to CLI
      }
    }

    if (isBinaryAvailable()) {
      return transcribeWithWhisper({
        audio: opts.audio,
        modelId,
        language: opts.language,
      });
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
