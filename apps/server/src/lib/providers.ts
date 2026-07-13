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

// Provider SDKs are imported lazily so that importing this module (which the
// route layer and Electron main both pull in at boot) does not eagerly evaluate
// every @ai-sdk/* package. Each SDK is loaded only when its provider is first
// used for cleanup.
const PROVIDER_FACTORIES: Record<
  string,
  (apiKey: string) => Promise<{
    chat?: (model: string) => LanguageModel;
  }>
> = {
  openai: async (apiKey) => {
    const { createOpenAI } = await import("@ai-sdk/openai");
    const p = createOpenAI({ apiKey });
    return { chat: (m) => p.chat(m) };
  },
  groq: async (apiKey) => {
    const [{ createGroq }, { groqFetch }] = await Promise.all([
      import("@ai-sdk/groq"),
      import("./groq-http.js"),
    ]);
    const p = createGroq({ apiKey, fetch: groqFetch });
    return { chat: (m) => p.languageModel(m) };
  },
  anthropic: async (apiKey) => {
    const { createAnthropic } = await import("@ai-sdk/anthropic");
    const p = createAnthropic({ apiKey });
    return { chat: (m) => p.chat(m) };
  },
  google: async (apiKey) => {
    const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
    const p = createGoogleGenerativeAI({ apiKey });
    return { chat: (m) => p.chat(m) };
  },
  mistral: async (apiKey) => {
    const { createMistral } = await import("@ai-sdk/mistral");
    const p = createMistral({ apiKey });
    return { chat: (m) => p.chat(m) };
  },
  "local-llm": async () => {
    const { createOpenAI } = await import("@ai-sdk/openai");
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

export async function createChatModel(
  providerId: string,
  modelId: string,
): Promise<LanguageModel> {
  const isLocal = LOCAL_PROVIDERS.has(providerId);
  const apiKey = isLocal ? "local" : getApiKeyForProvider(providerId);
  if (!apiKey)
    throw new Error(`No API key configured for provider: ${providerId}`);

  const factory = findFactory(providerId);
  if (!factory) throw new Error(`Unsupported provider: ${providerId}`);

  const provider = await factory(apiKey);
  if (!provider.chat) {
    throw new Error(`Provider ${providerId} does not support chat`);
  }

  return provider.chat(getChatModelId(providerId, modelId));
}
