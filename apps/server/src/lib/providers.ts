import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createMistral } from "@ai-sdk/mistral";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { getDb } from "./db.js";
import { reconcileUnsupportedMlxVoiceDefault } from "./mlx-asr/reconcile.js";
import { getApiKeyForProvider } from "./streaming-stt.js";

const LOCAL_PROVIDERS = new Set(["local-llm"]);
const PROVIDER_PREFIXED_CHAT_MODELS = new Set([
  "openai",
  "anthropic",
  "google",
  "mistral",
  "local-llm",
]);

const PROVIDER_FACTORIES: Record<
  string,
  (apiKey: string) => {
    chat?: (model: string) => LanguageModel;
  }
> = {
  openai: (apiKey) => {
    const p = createOpenAI({ apiKey });
    return { chat: (m) => p.chat(m) };
  },
  groq: (apiKey) => {
    const p = createGroq({ apiKey });
    return { chat: (m) => p.languageModel(m) };
  },
  anthropic: (apiKey) => {
    const p = createAnthropic({ apiKey });
    return { chat: (m) => p.chat(m) };
  },
  google: (apiKey) => {
    const p = createGoogleGenerativeAI({ apiKey });
    return { chat: (m) => p.chat(m) };
  },
  mistral: (apiKey) => {
    const p = createMistral({ apiKey });
    return { chat: (m) => p.chat(m) };
  },
  "local-llm": () => {
    const db = getDb();
    const urlRow = db
      .prepare("SELECT value FROM settings WHERE key = 'local_llm_url'")
      .get() as { value: string } | undefined;
    if (!urlRow?.value) {
      throw new Error(
        "Local LLM endpoint URL not configured. Go to Settings > Models to set it up.",
      );
    }
    const keyRow = db
      .prepare("SELECT value FROM settings WHERE key = 'local_llm_api_key'")
      .get() as { value: string } | undefined;

    const baseURL = urlRow.value.replace(/\/v1\/?$/, "");
    const apiKey = keyRow?.value || "local";

    const p = createOpenAI({ apiKey, baseURL: `${baseURL}/v1` });
    return { chat: (m: string) => p.chat(m) };
  },
};

function findFactory(providerId: string) {
  if (PROVIDER_FACTORIES[providerId]) return PROVIDER_FACTORIES[providerId];
  for (const [key, factory] of Object.entries(PROVIDER_FACTORIES)) {
    if (providerId.startsWith(key)) return factory;
  }
  return null;
}

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

export function createChatModel(
  providerId: string,
  modelId: string,
): LanguageModel {
  const isLocal = LOCAL_PROVIDERS.has(providerId);
  const apiKey = isLocal ? "local" : getApiKeyForProvider(providerId);
  if (!apiKey)
    throw new Error(`No API key configured for provider: ${providerId}`);

  const factory = findFactory(providerId);
  if (!factory) throw new Error(`Unsupported provider: ${providerId}`);

  const provider = factory(apiKey);
  if (!provider.chat) {
    throw new Error(`Provider ${providerId} does not support chat`);
  }

  return provider.chat(getChatModelId(providerId, modelId));
}
