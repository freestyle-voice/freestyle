import type { GroqLanguageModelOptions } from "@ai-sdk/groq";
import type { PostProcessParams } from "@freestyle-voice/stt";
import type { LanguageModel } from "ai";
import { getDb } from "../db.js";

/** The provider-options shape accepted by the cleanup `generateText` call. */
type CleanupProviderOptions = NonNullable<PostProcessParams["providerOptions"]>;

/**
 * A cleanup/post-processing LLM backend. Mirrors the transcription
 * `TranscriptionProvider` shape: adding a provider is a single descriptor in
 * the registry below. Provider SDKs are imported lazily inside `createModel`
 * so pulling in this module at boot doesn't eagerly evaluate every `@ai-sdk/*`
 * package.
 */
export interface LlmProvider {
  readonly providerId: string;
  /** Local endpoints resolve their own credentials rather than a stored key. */
  readonly local?: boolean;
  /**
   * Build (or return a cached) chat model. `modelId` is already stripped of the
   * provider prefix for prefixed providers; `apiKey` is `"local"` for local
   * providers.
   */
  createModel(
    modelId: string,
    apiKey: string,
  ): Promise<LanguageModel> | LanguageModel;
  /** Per-model provider options merged into the cleanup `generateText` call. */
  providerOptions?(modelId: string): CleanupProviderOptions | undefined;
  /** Warm the connection while the user is still speaking. */
  prewarm?(modelId: string): void;
}

function stripGroqPrefix(modelId: string): string {
  return modelId.startsWith("groq/") ? modelId.slice("groq/".length) : modelId;
}

/**
 * Reasoning-mode flags for Groq models that would otherwise emit visible
 * chain-of-thought or spend latency on reasoning we don't want during cleanup.
 */
export function groqCleanupProviderOptions(
  modelId: string,
): { groq: GroqLanguageModelOptions } | undefined {
  const shortId = stripGroqPrefix(modelId);

  switch (shortId) {
    case "qwen/qwen3-32b":
      return {
        groq: {
          reasoningFormat: "hidden",
          reasoningEffort: "none",
        },
      };
    case "openai/gpt-oss-20b":
    case "openai/gpt-oss-120b":
      return {
        groq: {
          reasoningFormat: "hidden",
          reasoningEffort: "low",
        },
      };
    default:
      return undefined;
  }
}

const PROVIDERS: LlmProvider[] = [
  {
    providerId: "openai",
    createModel: async (modelId, apiKey) => {
      const { createOpenAI } = await import("@ai-sdk/openai");
      return createOpenAI({ apiKey }).chat(modelId);
    },
  },
  {
    providerId: "groq",
    // Uses the cached, keep-alive Groq client which resolves its own key.
    createModel: async (modelId) => {
      const { getGroqChatModel } = await import("../groq-http.js");
      return getGroqChatModel(modelId);
    },
    providerOptions: (modelId) => groqCleanupProviderOptions(modelId),
    prewarm: (modelId) => {
      void import("../groq-http.js").then(({ prewarmGroqConnection }) =>
        prewarmGroqConnection(stripGroqPrefix(modelId)),
      );
    },
  },
  {
    providerId: "anthropic",
    createModel: async (modelId, apiKey) => {
      const { createAnthropic } = await import("@ai-sdk/anthropic");
      return createAnthropic({ apiKey }).chat(modelId);
    },
  },
  {
    providerId: "google",
    createModel: async (modelId, apiKey) => {
      const { createGoogleGenerativeAI } = await import("@ai-sdk/google");
      return createGoogleGenerativeAI({ apiKey }).chat(modelId);
    },
  },
  {
    providerId: "mistral",
    createModel: async (modelId, apiKey) => {
      const { createMistral } = await import("@ai-sdk/mistral");
      return createMistral({ apiKey }).chat(modelId);
    },
  },
  {
    providerId: "local-llm",
    local: true,
    createModel: async (modelId) => {
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

      return createOpenAI({ apiKey, baseURL: `${baseURL}/v1` }).chat(modelId);
    },
  },
];

const providerMap = new Map(PROVIDERS.map((p) => [p.providerId, p]));

/**
 * Resolve a cleanup LLM provider by id, matching an exact id first and then
 * falling back to a prefix match (e.g. `"openai/gpt-4o-mini"` → `openai`).
 */
export function getLlmProvider(providerId: string): LlmProvider | null {
  const exact = providerMap.get(providerId);
  if (exact) return exact;
  for (const provider of PROVIDERS) {
    if (providerId.startsWith(provider.providerId)) return provider;
  }
  return null;
}
