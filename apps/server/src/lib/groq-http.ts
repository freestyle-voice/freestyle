import { createGroq } from "@ai-sdk/groq";
import type { LanguageModel } from "ai";
import { getApiKeyForProvider } from "./streaming-stt.js";

/** Reuse TCP connections to Groq — avoids ~100–300ms TLS handshake per dictation. */
const groqFetch: typeof fetch = (input, init) =>
  fetch(input, { ...init, keepalive: true });

let cachedGroqKey: string | null = null;
let cachedChatModel: LanguageModel | null = null;
let cachedModelId: string | null = null;
let prewarmPromise: Promise<void> | null = null;

export function normalizeGroqModelId(modelId: string): string {
  return modelId.startsWith("groq/") ? modelId.slice("groq/".length) : modelId;
}

export function getGroqChatModel(modelId: string): LanguageModel {
  const apiKey = getApiKeyForProvider("groq");
  if (!apiKey) {
    throw new Error("No API key configured for provider: groq");
  }

  const shortId = normalizeGroqModelId(modelId);

  if (
    cachedChatModel &&
    cachedGroqKey === apiKey &&
    cachedModelId === shortId
  ) {
    return cachedChatModel;
  }

  const groq = createGroq({ apiKey, fetch: groqFetch });
  cachedGroqKey = apiKey;
  cachedModelId = shortId;
  cachedChatModel = groq.languageModel(shortId);
  return cachedChatModel;
}

/** Warm Groq while the user is still speaking so the handoff is ready on commit. */
export function prewarmGroqConnection(
  modelId = "llama-3.1-8b-instant",
): Promise<void> {
  if (prewarmPromise) return prewarmPromise;

  prewarmPromise = (async () => {
    const apiKey = getApiKeyForProvider("groq");
    if (!apiKey) return;

    try {
      getGroqChatModel(modelId);
      await groqFetch("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      prewarmPromise = null;
    }
  })();

  return prewarmPromise;
}

export function resetGroqClientCache(): void {
  cachedGroqKey = null;
  cachedChatModel = null;
  cachedModelId = null;
  prewarmPromise = null;
}
