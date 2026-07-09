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
  /**
   * Additional provider-specific options, passed straight through to the AI
   * SDK. The AI SDK's transcribe call has no standardized top-level
   * `language`/`prompt`/etc. inputs, so language hints and ASR bias prompts
   * (see {@link buildAsrBiasPrompt}) must be supplied here under the
   * provider's own key (e.g. Groq's `{ groq: { language, prompt } }` shape).
   * This package does not standardize those on your behalf.
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
