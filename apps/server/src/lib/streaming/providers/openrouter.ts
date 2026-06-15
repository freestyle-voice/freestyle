import { Buffer } from "node:buffer";
import {
  getOpenRouterHeaders,
  OPENROUTER_API_BASE,
  OPENROUTER_PROVIDER_ID,
} from "../../openrouter.js";
import type {
  TranscribeOptions,
  TranscribeResult,
  TranscriptionProvider,
} from "../types.js";
import { CLOUD_TRANSCRIBE_TIMEOUT_MS, stripProviderPrefix } from "../types.js";

interface OpenRouterTranscriptionResponse {
  text?: string;
  usage?: {
    seconds?: number;
  };
  error?: {
    message?: string;
  };
}

export class OpenRouterTranscriptionProvider implements TranscriptionProvider {
  readonly providerId = OPENROUTER_PROVIDER_ID;

  async transcribe(opts: TranscribeOptions): Promise<TranscribeResult> {
    const res = await fetch(`${OPENROUTER_API_BASE}/audio/transcriptions`, {
      method: "POST",
      headers: getOpenRouterHeaders(opts.apiKey, {
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        model: stripProviderPrefix(opts.model),
        input_audio: {
          data: Buffer.from(opts.audio).toString("base64"),
          format: "wav",
        },
        ...(opts.language && opts.language !== "auto"
          ? { language: opts.language }
          : {}),
      }),
      signal: AbortSignal.timeout(CLOUD_TRANSCRIBE_TIMEOUT_MS),
    });

    if (!res.ok) {
      const message = await readOpenRouterError(res);
      throw new Error(message);
    }

    const data = (await res.json()) as OpenRouterTranscriptionResponse;
    return {
      text: data.text?.trim() ?? "",
      durationInSeconds: data.usage?.seconds,
    };
  }

  supportsStreaming(_modelId: string): boolean {
    return false;
  }
}

async function readOpenRouterError(res: Response): Promise<string> {
  const body = (await res
    .json()
    .catch(() => null)) as OpenRouterTranscriptionResponse | null;
  const detail = body?.error?.message?.trim() ?? "";
  if (detail) return detail;
  return `OpenRouter transcription failed (${res.status})`;
}
