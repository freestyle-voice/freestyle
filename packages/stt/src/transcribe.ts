import type { ProviderOptions } from "@ai-sdk/provider-utils";
import type { TranscriptionModel } from "ai";
import { experimental_transcribe as aiTranscribe } from "ai";

/** Audio accepted by the AI SDK transcribe call. */
export type TranscribeAudio = Uint8Array | ArrayBuffer | string | URL;

export interface TranscribeParams {
  /**
   * The transcription model to use, built by the caller (e.g.
   * `groq.transcription("whisper-large-v3-turbo")`,
   * `openai.transcription("whisper-1")`). This package never constructs a
   * provider client or holds API keys — the caller owns those.
   */
  model: TranscriptionModel;
  audio: TranscribeAudio;
  /** ISO-639-1 hint (e.g. "en"). Omit or "auto" to auto-detect. */
  language?: string;
  /**
   * Optional initial prompt to bias recognition toward custom vocabulary
   * (see {@link buildAsrBiasPrompt}).
   */
  prompt?: string;
  /**
   * Additional provider-specific options, passed straight through to the AI
   * SDK. Use this for provider-specific knobs (e.g. Groq's
   * `{ groq: { language, prompt } }` shape) that this package does not
   * standardize on your behalf.
   */
  providerOptions?: ProviderOptions;
  /** Abort signal (e.g. a request timeout). */
  signal?: AbortSignal;
}

export interface TranscribeResult {
  text: string;
  durationInSeconds?: number;
  /** ISO-639-1 code detected by the provider, when available. */
  language?: string;
}

/** Transcribe an audio clip via a caller-supplied AI SDK transcription model. */
export async function transcribe(
  params: TranscribeParams,
): Promise<TranscribeResult> {
  const result = await aiTranscribe({
    model: params.model,
    audio: params.audio,
    ...(params.providerOptions
      ? { providerOptions: params.providerOptions }
      : {}),
    ...(params.signal ? { abortSignal: params.signal } : {}),
  });

  return {
    text: result.text.trim(),
    durationInSeconds: result.durationInSeconds,
    language: result.language,
  };
}
