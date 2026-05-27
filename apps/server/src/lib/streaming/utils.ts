import { experimental_transcribe as transcribe } from "ai";
import type { TranscribeOptions, TranscribeResult } from "./types.js";
import { stripProviderPrefix } from "./types.js";

type AiSdkProviderFactory = (config: { apiKey: string }) => {
  transcription: (id: string) => Parameters<typeof transcribe>[0]["model"];
};

export async function transcribeWithAiSdk(
  opts: TranscribeOptions,
  createProvider: AiSdkProviderFactory,
): Promise<TranscribeResult> {
  const provider = createProvider({ apiKey: opts.apiKey });
  const model = provider.transcription(stripProviderPrefix(opts.model));
  const result = await transcribe({
    model,
    audio: opts.audio,
    ...(opts.language && opts.language !== "auto"
      ? { language: opts.language }
      : {}),
  });
  return {
    text: result.text,
    segments: result.segments,
    durationInSeconds: result.durationInSeconds,
  };
}
