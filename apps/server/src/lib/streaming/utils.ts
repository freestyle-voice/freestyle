import { experimental_transcribe as transcribe } from "ai";
import type { AsrVocabularyBias } from "../vocabulary-bias.js";
import { providerOptionsFromBias } from "./transcribe-bias.js";
import type { TranscribeOptions, TranscribeResult } from "./types.js";
import { CLOUD_TRANSCRIBE_TIMEOUT_MS, stripProviderPrefix } from "./types.js";

type AiSdkProviderFactory = (config: { apiKey: string }) => {
  transcription: (id: string) => Parameters<typeof transcribe>[0]["model"];
};

const LANGUAGE_OPTION_KEYS: Record<string, string> = {
  elevenlabs: "languageCode",
};

export function aiSdkProviderOptions(
  providerId: string,
  language: string | undefined,
  bias: AsrVocabularyBias | null | undefined,
): Record<string, Record<string, string>> | undefined {
  const options: Record<string, Record<string, string>> = {
    ...providerOptionsFromBias(providerId, bias),
  };
  if (language && language !== "auto") {
    const key = LANGUAGE_OPTION_KEYS[providerId] ?? "language";
    options[providerId] = { ...options[providerId], [key]: language };
  }
  return Object.keys(options).length > 0 ? options : undefined;
}

export async function transcribeWithAiSdk(
  opts: TranscribeOptions,
  createProvider: AiSdkProviderFactory,
  providerId: string,
): Promise<TranscribeResult> {
  const provider = createProvider({ apiKey: opts.apiKey });
  const model = provider.transcription(stripProviderPrefix(opts.model));
  const providerOptions = aiSdkProviderOptions(
    providerId,
    opts.language,
    opts.bias,
  );
  const result = await transcribe({
    model,
    audio: opts.audio,
    abortSignal: AbortSignal.timeout(CLOUD_TRANSCRIBE_TIMEOUT_MS),
    ...(providerOptions ? { providerOptions } : {}),
  });
  return {
    text: result.text,
    segments: result.segments,
    durationInSeconds: result.durationInSeconds,
  };
}
