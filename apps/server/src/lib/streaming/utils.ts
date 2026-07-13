import type { TranscribeParams } from "@freestyle-voice/stt";
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

/** The provider-options map accepted by the AI SDK `transcribe` call. */
type TranscribeProviderOptions = NonNullable<
  TranscribeParams["providerOptions"]
>;

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
  /**
   * Extra provider-specific transcription options merged under the provider's
   * key — for settings the generic language/bias path doesn't cover (e.g.
   * Deepgram's punctuation, smart formatting, and multilingual default).
   */
  extraProviderOptions?: (
    opts: TranscribeOptions,
  ) => TranscribeProviderOptions[string] | undefined;
}

const LANGUAGE_OPTION_KEYS: Record<string, string> = {
  elevenlabs: "languageCode",
};

export function aiSdkProviderOptions(
  providerId: string,
  language: string | undefined,
  bias: AsrVocabularyBias | null | undefined,
): TranscribeProviderOptions | undefined {
  const options: TranscribeProviderOptions = {
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
  extraProviderOptions?: TranscribeProviderOptions[string],
): Promise<TranscribeResult> {
  const provider = createProvider({ apiKey: opts.apiKey });
  const model = provider.transcription(stripProviderPrefix(opts.model));
  const base = aiSdkProviderOptions(providerId, opts.language, opts.bias);
  const providerOptions =
    extraProviderOptions && Object.keys(extraProviderOptions).length > 0
      ? {
          ...base,
          [providerId]: { ...base?.[providerId], ...extraProviderOptions },
        }
      : base;
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
 *
 * `loadProvider` is invoked lazily on first transcription so that importing the
 * registry at boot doesn't eagerly evaluate every `@ai-sdk/*` package — only
 * the SDK for the provider actually used is loaded.
 */
export function makeAiSdkTranscriptionProvider(
  providerId: string,
  loadProvider: () => Promise<AiSdkProviderFactory>,
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
      const createProvider = await loadProvider();
      const extra = options.extraProviderOptions?.(withModel);
      return transcribeWithAiSdk(withModel, createProvider, providerId, extra);
    },
  };
}
