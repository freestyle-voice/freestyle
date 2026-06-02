import { getDb } from "./db.js";
import { MLX_ASR_PROVIDER_ID } from "./mlx-asr/constants.js";
import { getProvider, supportsStreaming } from "./streaming/registry.js";
import type { StreamCallbacks, StreamSession } from "./streaming/types.js";
import type { AsrVocabularyBias } from "./vocabulary-bias.js";
import { WHISPER_PROVIDER_ID } from "./whisper/constants.js";

export { supportsStreaming } from "./streaming/registry.js";
export type { StreamCallbacks, StreamSession } from "./streaming/types.js";

const LOCAL_STT_PROVIDERS = new Set([WHISPER_PROVIDER_ID, MLX_ASR_PROVIDER_ID]);

export function openStreamingSession(opts: {
  providerId: string;
  apiKey: string;
  model: string;
  language?: string;
  bias?: AsrVocabularyBias | null;
  callbacks: StreamCallbacks;
}): StreamSession {
  const { providerId, apiKey, model, language, bias, callbacks } = opts;

  const provider = getProvider(providerId);
  if (!provider) {
    throw new Error(`No transcription provider for: ${providerId}`);
  }
  if (!provider.openStreamingSession) {
    throw new Error(`Provider ${providerId} does not support streaming`);
  }
  if (!supportsStreaming(providerId, model)) {
    throw new Error(
      `Model ${model} on provider ${providerId} does not support streaming`,
    );
  }

  return provider.openStreamingSession({
    apiKey,
    model,
    language,
    bias,
    callbacks,
  });
}

export function getApiKeyForProvider(providerId: string): string | null {
  if (LOCAL_STT_PROVIDERS.has(providerId)) return "local";

  const db = getDb();
  const row = db
    .prepare("SELECT key FROM api_keys WHERE provider = ?")
    .get(providerId) as { key: string } | undefined;
  return row?.key ?? null;
}
