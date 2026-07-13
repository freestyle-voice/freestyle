import { FreestyleCloudTranscriptionProvider } from "./providers/freestyle-cloud.js";
import { MlxLocalTranscriptionProvider } from "./providers/mlx-local.js";
import { WhisperLocalTranscriptionProvider } from "./providers/whisper-local.js";
import {
  transcribeDeepgramListen,
  transcribeElevenLabsWithBias,
} from "./transcribe-bias.js";
import type { TranscriptionProvider } from "./types.js";
import { stripProviderPrefix } from "./types.js";
import { makeAiSdkTranscriptionProvider } from "./utils.js";

// The registry is the single extension point for transcription backends. Cloud
// providers that speak the Vercel AI SDK are one declarative line via
// `makeAiSdkTranscriptionProvider`; providers with bespoke transports (raw
// fetch, local subprocess) implement `TranscriptionProvider` directly. The
// `@ai-sdk/*` packages are imported lazily on first use so that pulling in this
// registry at boot doesn't eagerly evaluate every provider SDK.
const providers: TranscriptionProvider[] = [
  makeAiSdkTranscriptionProvider(
    "openai",
    async () => (await import("@ai-sdk/openai")).createOpenAI,
  ),
  new FreestyleCloudTranscriptionProvider(),
  makeAiSdkTranscriptionProvider(
    "deepgram",
    async () => (await import("@ai-sdk/deepgram")).createDeepgram,
    {
      // Preserve the batch defaults the raw /listen endpoint used: punctuation
      // and smart formatting on, diarization off, and Deepgram's multilingual
      // model when no explicit language is set.
      extraProviderOptions: (opts) => ({
        punctuate: true,
        smartFormat: true,
        diarize: false,
        ...(opts.language && opts.language !== "auto"
          ? {}
          : { language: "multi" }),
      }),
      // Keyterm/keyword bias isn't expressible through the AI SDK — fall back to
      // the raw Deepgram /listen endpoint for those.
      biasHandler: (opts) => {
        const bias =
          opts.bias?.kind === "deepgram-keyterms" ||
          opts.bias?.kind === "deepgram-keywords"
            ? opts.bias
            : null;
        return bias ? transcribeDeepgramListen(opts, bias) : null;
      },
    },
  ),
  makeAiSdkTranscriptionProvider(
    "elevenlabs",
    async () => (await import("@ai-sdk/elevenlabs")).createElevenLabs,
    {
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
    },
  ),
  makeAiSdkTranscriptionProvider(
    "groq",
    async () => (await import("@ai-sdk/groq")).createGroq,
  ),
  new WhisperLocalTranscriptionProvider(),
  new MlxLocalTranscriptionProvider(),
];

const providerMap = new Map(providers.map((p) => [p.providerId, p]));

export function getProvider(providerId: string): TranscriptionProvider | null {
  return providerMap.get(providerId) ?? null;
}
