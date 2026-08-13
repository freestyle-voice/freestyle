import type { LanguageModel } from "ai";
import { getDb } from "./db.js";
import { FREESTYLE_CLOUD_PROVIDER_ID } from "./freestyle-cloud.js";
import { createFreestyleCloudChatModel } from "./llm/registry.js";
import { getApiKeyForProvider } from "./streaming-stt.js";

function stripCloudPrefix(modelId: string): string {
  const prefix = `${FREESTYLE_CLOUD_PROVIDER_ID}/`;
  return modelId.startsWith(prefix) ? modelId.slice(prefix.length) : modelId;
}

interface DefaultModels {
  voice: { provider: string; model_id: string; model_name: string } | null;
  llm: { provider: string; model_id: string; model_name: string } | null;
}

export function getDefaultModels(): DefaultModels {
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
  if (providerId !== FREESTYLE_CLOUD_PROVIDER_ID) {
    throw new Error(`Unsupported provider: ${providerId}`);
  }
  const token = getApiKeyForProvider(FREESTYLE_CLOUD_PROVIDER_ID);
  if (!token) throw new Error("Sign in to Freestyle Cloud to use AI cleanup");
  return createFreestyleCloudChatModel(stripCloudPrefix(modelId), token);
}
