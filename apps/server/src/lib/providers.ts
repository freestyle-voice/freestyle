import type { LanguageModel } from "ai";
import { getDb } from "./db.js";
import { getLlmProvider } from "./llm/registry.js";
import { reconcileUnsupportedMlxVoiceDefault } from "./mlx-asr/reconcile.js";
import { getApiKeyForProvider } from "./streaming-stt.js";

const LOCAL_PROVIDERS = new Set(["local-llm"]);
const PROVIDER_PREFIXED_CHAT_MODELS = new Set([
  "openai",
  "anthropic",
  "google",
  "mistral",
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
  const provider = getLlmProvider(providerId);
  if (!provider) throw new Error(`Unsupported provider: ${providerId}`);

  const isLocal = provider.local ?? LOCAL_PROVIDERS.has(providerId);
  const apiKey = isLocal ? "local" : getApiKeyForProvider(providerId);
  if (!apiKey)
    throw new Error(`No API key configured for provider: ${providerId}`);

  return provider.createModel(getChatModelId(providerId, modelId), apiKey);
}
