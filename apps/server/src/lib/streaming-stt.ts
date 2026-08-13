import { FREESTYLE_CLOUD_PROVIDER_ID } from "./freestyle-cloud.js";
import { getSessionToken } from "./sessions.js";
import { getProvider, supportsSessionTransport } from "./streaming/registry.js";
import type {
  StreamCallbacks,
  StreamCleanupPreferences,
  StreamSession,
} from "./streaming/types.js";
import type { AsrVocabularyBias } from "./vocabulary-bias.js";

export {
  supportsSessionTransport,
  supportsStreaming,
} from "./streaming/registry.js";
export type { StreamCallbacks, StreamSession } from "./streaming/types.js";

export type VoiceProviderCategory = "freestyle_cloud";

export function voiceProviderCategory(
  _providerId: string,
): VoiceProviderCategory {
  return "freestyle_cloud";
}

export function openStreamingSession(opts: {
  providerId: string;
  apiKey: string;
  model: string;
  languages?: string[];
  translate?: boolean;
  bias?: AsrVocabularyBias | null;
  appContext?: string | null;
  cleanup?: StreamCleanupPreferences;
  callbacks: StreamCallbacks;
}): StreamSession {
  const {
    providerId,
    apiKey,
    model,
    languages,
    translate,
    bias,
    appContext,
    cleanup,
    callbacks,
  } = opts;

  const provider = getProvider(providerId);
  if (!provider) {
    throw new Error(`No transcription provider for: ${providerId}`);
  }
  if (!provider.openStreamingSession) {
    throw new Error(`Provider ${providerId} does not support streaming`);
  }
  if (!supportsSessionTransport(providerId, model)) {
    throw new Error(
      `Model ${model} on provider ${providerId} does not support session audio transport`,
    );
  }

  return provider.openStreamingSession({
    apiKey,
    model,
    languages,
    translate,
    bias,
    appContext,
    cleanup,
    callbacks,
  });
}

export function getApiKeyForProvider(providerId: string): string | null {
  if (providerId !== FREESTYLE_CLOUD_PROVIDER_ID) return null;
  return getSessionToken();
}
