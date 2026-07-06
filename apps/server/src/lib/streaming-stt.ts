import { getDb } from "./db.js";
import { FREESTYLE_CLOUD_PROVIDER_ID } from "./freestyle-cloud.js";
import { MLX_ASR_PROVIDER_ID } from "./mlx-asr/constants.js";
import { getSessionToken } from "./sessions.js";
import { WHISPER_PROVIDER_ID } from "./whisper/constants.js";

const LOCAL_STT_PROVIDERS = new Set([WHISPER_PROVIDER_ID, MLX_ASR_PROVIDER_ID]);

export type VoiceProviderCategory = "local" | "byok" | "freestyle_cloud";

export function voiceProviderCategory(
  providerId: string,
): VoiceProviderCategory {
  if (LOCAL_STT_PROVIDERS.has(providerId)) return "local";
  if (providerId === FREESTYLE_CLOUD_PROVIDER_ID) return "freestyle_cloud";
  return "byok";
}

export function getApiKeyForProvider(providerId: string): string | null {
  // On-device engines need no key.
  if (LOCAL_STT_PROVIDERS.has(providerId)) return "local";
  // Freestyle Cloud uses the signed-in user's session token (null = signed out).
  if (providerId === FREESTYLE_CLOUD_PROVIDER_ID) return getSessionToken();

  const db = getDb();
  const row = db
    .prepare("SELECT key FROM api_keys WHERE provider = ?")
    .get(providerId) as { key: string } | undefined;
  return row?.key ?? null;
}
