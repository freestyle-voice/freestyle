import { createElevenLabs } from "@ai-sdk/elevenlabs";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAI } from "@ai-sdk/openai";
import { DeepgramTranscriptionProvider } from "./providers/deepgram.js";
import { FreestyleCloudTranscriptionProvider } from "./providers/freestyle-cloud.js";
import { MlxLocalTranscriptionProvider } from "./providers/mlx-local.js";
import { WhisperLocalTranscriptionProvider } from "./providers/whisper-local.js";
import { transcribeElevenLabsWithBias } from "./transcribe-bias.js";
import type { TranscriptionProvider } from "./types.js";
import { stripProviderPrefix } from "./types.js";
import { makeAiSdkTranscriptionProvider } from "./utils.js";

// The registry is the single extension point for transcription backends. Cloud
// providers that speak the Vercel AI SDK are one declarative line via
// `makeAiSdkTranscriptionProvider`; providers with bespoke transports (raw
// fetch, local subprocess) implement `TranscriptionProvider` directly.
const providers: TranscriptionProvider[] = [
  makeAiSdkTranscriptionProvider("openai", createOpenAI),
  new FreestyleCloudTranscriptionProvider(),
  new DeepgramTranscriptionProvider(),
  makeAiSdkTranscriptionProvider("elevenlabs", createElevenLabs, {
    // Scribe's `_realtime` variant shares the batch endpoint under its base id.
    modelTransform: (model) =>
      stripProviderPrefix(model).endsWith("_realtime")
        ? model.replace(/_realtime$/, "")
        : model,
    // Keyterm bias isn't expressible through the AI SDK — use the raw endpoint.
    biasHandler: (opts) =>
      opts.bias?.kind === "elevenlabs-keyterms"
        ? transcribeElevenLabsWithBias(opts, opts.bias)
        : null,
  }),
  makeAiSdkTranscriptionProvider("groq", createGroq),
  new WhisperLocalTranscriptionProvider(),
  new MlxLocalTranscriptionProvider(),
];

const providerMap = new Map(providers.map((p) => [p.providerId, p]));

export function getProvider(providerId: string): TranscriptionProvider | null {
  return providerMap.get(providerId) ?? null;
}
