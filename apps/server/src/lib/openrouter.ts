export const OPENROUTER_API_BASE = "https://openrouter.ai/api/v1";
export const OPENROUTER_PROVIDER_ID = "openrouter";
export const OPENROUTER_PROVIDER_NAME = "OpenRouter";

const OPENROUTER_APP_URL = "https://github.com/freestyle-voice/freestyle";
const OPENROUTER_APP_TITLE = "Freestyle";

export function getOpenRouterHeaders(
  apiKey?: string,
  extra?: Record<string, string>,
): Record<string, string> {
  return {
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    "HTTP-Referer": OPENROUTER_APP_URL,
    "X-Title": OPENROUTER_APP_TITLE,
    ...extra,
  };
}

export function prefixOpenRouterModelId(modelId: string): string {
  return modelId.startsWith(`${OPENROUTER_PROVIDER_ID}/`)
    ? modelId
    : `${OPENROUTER_PROVIDER_ID}/${modelId}`;
}
