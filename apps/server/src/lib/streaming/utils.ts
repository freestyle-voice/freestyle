import { experimental_transcribe as transcribe } from "ai";
import { providerOptionsFromBias } from "./transcribe-bias.js";
import type { TranscribeOptions, TranscribeResult } from "./types.js";
import { CLOUD_TRANSCRIBE_TIMEOUT_MS, stripProviderPrefix } from "./types.js";

type AiSdkProviderFactory = (config: { apiKey: string }) => {
  transcription: (id: string) => Parameters<typeof transcribe>[0]["model"];
};

export async function transcribeWithAiSdk(
  opts: TranscribeOptions,
  createProvider: AiSdkProviderFactory,
  providerId: string,
): Promise<TranscribeResult> {
  const provider = createProvider({ apiKey: opts.apiKey });
  const model = provider.transcription(stripProviderPrefix(opts.model));
  const providerOptions = providerOptionsFromBias(providerId, opts.bias);
  const result = await transcribe({
    model,
    audio: opts.audio,
    abortSignal: AbortSignal.timeout(CLOUD_TRANSCRIBE_TIMEOUT_MS),
    ...(opts.language && opts.language !== "auto"
      ? { language: opts.language }
      : {}),
    ...(providerOptions ? { providerOptions } : {}),
  });
  return {
    text: result.text,
    segments: result.segments,
    durationInSeconds: result.durationInSeconds,
  };
}
