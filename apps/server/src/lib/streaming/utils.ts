import { transcribe } from "@freestyle-voice/stt";
import type { TranscriptionModel } from "ai";
import type { AsrVocabularyBias } from "../vocabulary-bias.js";
import { providerOptionsFromBias } from "./transcribe-bias.js";
import type {
  TranscribeOptions,
  TranscribeResult,
  TranscriptionProvider,
} from "./types.js";
import { CLOUD_TRANSCRIBE_TIMEOUT_MS, stripProviderPrefix } from "./types.js";

type AiSdkProviderFactory = (config: { apiKey: string }) => {
  transcription: (id: string) => TranscriptionModel;
};

/** Per-provider tweaks for {@link makeAiSdkTranscriptionProvider}. */
export interface AiSdkTranscriptionOptions {
  /**
   * Rewrite the requested model id before it hits the SDK (e.g. ElevenLabs
   * strips a `_realtime` suffix). Receives the raw `opts.model`.
   */
  modelTransform?: (model: string) => string;
  /**
   * Optional escape hatch for provider-specific vocabulary bias that the AI SDK
   * can't express. Return a result to short-circuit, or `null`/`undefined` to
   * fall through to the standard AI-SDK path. Receives options with the model
   * already transformed by `modelTransform`.
   */
  biasHandler?: (
    opts: TranscribeOptions,
  ) => Promise<TranscribeResult> | TranscribeResult | null | undefined;
}

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
    signal: AbortSignal.timeout(CLOUD_TRANSCRIBE_TIMEOUT_MS),
    ...(providerOptions ? { providerOptions } : {}),
  });
  return {
    text: result.text,
    durationInSeconds: result.durationInSeconds,
  };
}

/**
 * Build a {@link TranscriptionProvider} for any Vercel AI SDK provider whose
 * factory follows the `createX({ apiKey }).transcription(id)` shape. Collapses
 * the otherwise-identical per-provider adapter classes into a single
 * declarative entry in the registry.
 */
export function makeAiSdkTranscriptionProvider(
  providerId: string,
  createProvider: AiSdkProviderFactory,
  options: AiSdkTranscriptionOptions = {},
): TranscriptionProvider {
  return {
    providerId,
    async transcribe(opts) {
      const model = options.modelTransform
        ? options.modelTransform(opts.model)
        : opts.model;
      const withModel = model === opts.model ? opts : { ...opts, model };
      const biased = await options.biasHandler?.(withModel);
      if (biased) return biased;
      return transcribeWithAiSdk(withModel, createProvider, providerId);
    },
  };
}
