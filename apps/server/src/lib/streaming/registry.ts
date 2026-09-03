import { DeepgramTranscriptionProvider } from "./providers/deepgram.js";
import { ElevenLabsTranscriptionProvider } from "./providers/elevenlabs.js";
import { FreestyleCloudTranscriptionProvider } from "./providers/freestyle-cloud.js";
import { GroqTranscriptionProvider } from "./providers/groq.js";
import { MlxLocalTranscriptionProvider } from "./providers/mlx-local.js";
import { OpenAITranscriptionProvider } from "./providers/openai.js";
import { SonioxTranscriptionProvider } from "./providers/soniox.js";
import { WhisperLocalTranscriptionProvider } from "./providers/whisper-local.js";
import type { TranscriptionProvider } from "./types.js";

const providers: TranscriptionProvider[] = [
  new OpenAITranscriptionProvider(),
  new FreestyleCloudTranscriptionProvider(),
  new DeepgramTranscriptionProvider(),
  new ElevenLabsTranscriptionProvider(),
  new GroqTranscriptionProvider(),
  new SonioxTranscriptionProvider(),
  new WhisperLocalTranscriptionProvider(),
  new MlxLocalTranscriptionProvider(),
];

const providerMap = new Map(providers.map((p) => [p.providerId, p]));

export function getProvider(providerId: string): TranscriptionProvider | null {
  return providerMap.get(providerId) ?? null;
}

export function supportsStreaming(
  providerId: string,
  modelId: string,
): boolean {
  const provider = providerMap.get(providerId);
  if (!provider) return false;
  if (!provider.openStreamingSession) return false;
  return provider.supportsStreaming(modelId);
}

export function supportsSessionTransport(
  providerId: string,
  modelId: string,
): boolean {
  const provider = providerMap.get(providerId);
  if (!provider) return false;
  if (!provider.openStreamingSession) return false;
  return (
    provider.supportsSessionTransport?.(modelId) ??
    provider.supportsStreaming(modelId)
  );
}
