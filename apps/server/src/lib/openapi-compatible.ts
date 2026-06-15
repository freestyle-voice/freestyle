import { normalizeOpenApiCompatibleEndpoint } from "@freestyle/validations";
import { getOpenRouterHeaders } from "./openrouter.js";

const MANUAL_MODEL_SELECTION_STATUSES = new Set([400, 404, 405, 422, 501]);

export function getNormalizedOpenApiCompatibleEndpoint(
  value: unknown,
): string | null {
  return normalizeOpenApiCompatibleEndpoint(value) ?? null;
}

export function isAzureOpenAiEndpoint(endpoint: string): boolean {
  const url = safeParseUrl(endpoint);
  return Boolean(url?.hostname.endsWith(".openai.azure.com"));
}

export function isOfficialOpenAiEndpoint(endpoint: string): boolean {
  const url = safeParseUrl(endpoint);
  return Boolean(url && url.hostname === "api.openai.com");
}

export function isOpenRouterEndpoint(endpoint: string): boolean {
  const url = safeParseUrl(endpoint);
  return Boolean(url && url.hostname === "openrouter.ai");
}

export function getOpenApiCompatibleProviderLabel(endpoint: string): string {
  if (isAzureOpenAiEndpoint(endpoint)) return "Azure OpenAI";

  const url = safeParseUrl(endpoint);
  if (!url) return "OpenAPI Compatible";
  if (url.hostname === "api.openai.com") return "OpenAI";
  if (url.hostname === "openrouter.ai") return "OpenRouter";
  if (url.hostname === "api.moonshot.cn") return "Moonshot";
  if (url.hostname === "api.together.ai") return "Together AI";
  if (url.hostname === "api.fireworks.ai") return "Fireworks AI";
  if (url.hostname === "api.deepinfra.com") return "DeepInfra";
  if (url.hostname === "api.sambanova.ai") return "SambaNova";
  if (isLocalOpenApiHost(url.hostname)) {
    return "Local OpenAPI";
  }
  return "OpenAPI Compatible";
}

export function canUseManualOpenApiCompatibleModelSelection(
  status: number,
): boolean {
  return MANUAL_MODEL_SELECTION_STATUSES.has(status);
}

export function getOpenApiCompatibleManualModelHint(endpoint: string): string {
  if (isAzureOpenAiEndpoint(endpoint)) {
    return "Azure OpenAI often skips shared /models discovery here. Enter your deployment name manually below, then choose it as the cleanup model.";
  }

  if (isOpenRouterEndpoint(endpoint)) {
    return "OpenRouter did not return model discovery from this endpoint right now. Enter the model ID manually below if you want to use it anyway.";
  }

  const url = safeParseUrl(endpoint);
  if (url?.hostname === "api.moonshot.cn") {
    return "Moonshot did not return model discovery from this endpoint right now. Enter the model name manually below, then choose it as the cleanup model.";
  }

  if (url && isLocalOpenApiHost(url.hostname)) {
    return "This local gateway did not expose /models. Enter the model name manually below, then choose it as the cleanup model.";
  }

  return "This OpenAPI-compatible endpoint did not expose /models. Enter the model or deployment name manually below, then choose it as the cleanup model.";
}

export function buildOpenApiCompatibleHeaders(
  endpoint: string,
  apiKey?: string,
  extra?: Record<string, string>,
): Record<string, string> {
  if (isOpenRouterEndpoint(endpoint)) {
    return getOpenRouterHeaders(apiKey, extra);
  }

  const headers: Record<string, string> = {
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    ...extra,
  };

  if (apiKey) {
    if (isAzureOpenAiEndpoint(endpoint)) {
      headers["api-key"] = apiKey;
    } else if (!isOfficialOpenAiEndpoint(endpoint)) {
      headers["x-api-key"] = apiKey;
    }
  }

  return headers;
}

function safeParseUrl(endpoint: string): URL | null {
  try {
    return new URL(endpoint);
  } catch {
    return null;
  }
}

function isLocalOpenApiHost(hostname: string): boolean {
  return (
    hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1"
  );
}
