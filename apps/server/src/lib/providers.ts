import type { LanguageModel } from "ai";
import { getDb } from "./db.js";
import { FREESTYLE_CLOUD_PROVIDER_ID } from "./freestyle-cloud.js";
import { getLlmProvider } from "./llm/registry.js";
import { reconcileUnsupportedMlxVoiceDefault } from "./mlx-asr/reconcile.js";
import { getApiKeyForProvider } from "./streaming-stt.js";

const LOCAL_PROVIDERS = new Set(["local-llm"]);
const PROVIDER_PREFIXED_CHAT_MODELS = new Set([
  "openai",
  "anthropic",
  "google",
  "mistral",
  "openrouter",
  "vercel",
  "local-llm",
  "freestyle-cloud",
]);

function getChatModelId(providerId: string, modelId: string): string {
  if (
    PROVIDER_PREFIXED_CHAT_MODELS.has(providerId) &&
    modelId.startsWith(`${providerId}/`)
  ) {
    return modelId.slice(providerId.length + 1);
  }
  return modelId;
}

interface DefaultModels {
  voice: { provider: string; model_id: string; model_name: string } | null;
  llm: { provider: string; model_id: string; model_name: string } | null;
}

export function getDefaultModels(): DefaultModels {
  reconcileUnsupportedMlxVoiceDefault();
  const db = getDb();
  const voice = db
    .prepare(
      "SELECT provider, model_id, model_name FROM model_configs WHERE type = 'voice' AND is_default = 1 LIMIT 1",
    )
    .get() as
    | { provider: string; model_id: string; model_name: string }
    | undefined;
  const llm = db
    .prepare(
      "SELECT provider, model_id, model_name FROM model_configs WHERE type = 'llm' AND is_default = 1 LIMIT 1",
    )
    .get() as
    | { provider: string; model_id: string; model_name: string }
    | undefined;

  return {
    voice: voice ?? null,
    llm: llm ?? null,
  };
}

export async function createChatModel(
  providerId: string,
  modelId: string,
): Promise<LanguageModel> {
  // `createChatModel` backs the plugin capability. Keep that surface scoped to
  // the signed-in Freestyle Cloud account; locally configured BYOK models are
  // intentionally available only to dictation cleanup below.
  if (providerId !== FREESTYLE_CLOUD_PROVIDER_ID) {
    throw new Error(`Unsupported provider: ${providerId}`);
  }

  const apiKey = getApiKeyForProvider(FREESTYLE_CLOUD_PROVIDER_ID);
  if (!apiKey) {
    throw new Error("Sign in to Freestyle Cloud to use AI cleanup");
  }

  const provider = getLlmProvider(FREESTYLE_CLOUD_PROVIDER_ID);
  if (!provider) {
    throw new Error("Freestyle Cloud LLM provider is unavailable");
  }
  return provider.createModel(
    getChatModelId(FREESTYLE_CLOUD_PROVIDER_ID, modelId),
    apiKey,
  );
}

/**
 * Resolve a model from the user's configured Models preference. This is
 * deliberately separate from `createChatModel`: plugin hooks stay Cloud-only,
 * while product-owned flows such as dictation cleanup and the local Remix
 * assistant can use the user's chosen provider without exposing that provider
 * to plugins.
 */
export async function createConfiguredModel(
  providerId: string,
  modelId: string,
): Promise<LanguageModel> {
  const provider = getLlmProvider(providerId);
  if (!provider) throw new Error(`Unsupported provider: ${providerId}`);

  const isLocal = provider.local ?? LOCAL_PROVIDERS.has(providerId);
  const apiKey = isLocal ? "local" : getApiKeyForProvider(providerId);
  if (!apiKey)
    throw new Error(`No API key configured for provider: ${providerId}`);

  return provider.createModel(getChatModelId(providerId, modelId), apiKey);
}
