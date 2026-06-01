import { DeepgramTranscriptionProvider } from "./providers/deepgram.js";
import { ElevenLabsTranscriptionProvider } from "./providers/elevenlabs.js";
import { GroqTranscriptionProvider } from "./providers/groq.js";
import { MlxLocalTranscriptionProvider } from "./providers/mlx-local.js";
import { OpenAITranscriptionProvider } from "./providers/openai.js";
import { WhisperLocalTranscriptionProvider } from "./providers/whisper-local.js";
import type { TranscriptionProvider } from "./types.js";

const providers: TranscriptionProvider[] = [
  new OpenAITranscriptionProvider(),
  new DeepgramTranscriptionProvider(),
  new ElevenLabsTranscriptionProvider(),
  new GroqTranscriptionProvider(),
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
