export type OpenApiEndpointPresetApplyMode = "save" | "draft";

export interface OpenApiEndpointPreset {
  id: string;
  label: string;
  endpoint: string;
  applyMode: OpenApiEndpointPresetApplyMode;
  description: string;
}

/**
 * Curated list of the most commonly used OpenAPI-compatible providers.
 * Lesser-known providers are intentionally omitted to keep the picker
 * approachable; users can still reach any other endpoint through the
 * "Custom endpoint" preset.
 */
export const OPENAPI_ENDPOINT_PRESETS: readonly OpenApiEndpointPreset[] = [
  {
    id: "openrouter",
    label: "OpenRouter",
    endpoint: "https://openrouter.ai/api/v1",
    applyMode: "save",
    description:
      "OpenRouter's OpenAPI-compatible base for models and chat completions.",
  },
  {
    id: "azure",
    label: "Azure OpenAI",
    endpoint: "https://YOUR-RESOURCE-NAME.openai.azure.com/openai/v1",
    applyMode: "draft",
    description:
      "Prefills the Azure OpenAI v1 base. Replace YOUR-RESOURCE-NAME first.",
  },
  {
    id: "litellm-local",
    label: "LiteLLM / Local",
    endpoint: "http://localhost:4000/v1",
    applyMode: "save",
    description: "Common local LiteLLM gateway port.",
  },
  {
    id: "together",
    label: "Together AI",
    endpoint: "https://api.together.ai/v1",
    applyMode: "save",
    description:
      "Together AI's OpenAI-compatible base for open-weight chat and speech models.",
  },
  {
    id: "fireworks",
    label: "Fireworks AI",
    endpoint: "https://api.fireworks.ai/inference/v1",
    applyMode: "save",
    description:
      "Fireworks AI's OpenAI-compatible inference base for chat-capable models.",
  },
  {
    id: "https-template",
    label: "Custom endpoint",
    endpoint: "https://YOUR-HOSTNAME.example.com/v1",
    applyMode: "draft",
    description: "Any other hosted OpenAPI-compatible gateway or proxy.",
  },
] as const;

/**
 * Cloud providers whose endpoint is fixed and only requires an API key.
 * These are surfaced as first-class provider chips rather than manual
 * endpoint presets.
 */
export const OPENAPI_CLOUD_PROVIDER_IDS = [
  "openrouter",
  "together",
  "fireworks",
] as const;

export type OpenApiCloudProviderId =
  (typeof OPENAPI_CLOUD_PROVIDER_IDS)[number];

export function isFixedOpenApiEndpoint(endpoint: string): boolean {
  return (
    !endpoint.includes("YOUR-") &&
    !endpoint.includes("example.com") &&
    !endpoint.includes("localhost") &&
    !endpoint.includes("127.0.0.1")
  );
}

export function getOpenApiEndpointPreset(id: string) {
  return OPENAPI_ENDPOINT_PRESETS.find((p) => p.id === id);
}

export function normalizeOpenApiCompatibleEndpoint(
  value: unknown,
): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 2_048 || /[\0\r\n]/.test(trimmed)) {
    return undefined;
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return undefined;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;
  if (
    url.protocol === "http:" &&
    url.hostname !== "localhost" &&
    url.hostname !== "127.0.0.1" &&
    url.hostname !== "::1"
  ) {
    return undefined;
  }
  if (!url.hostname || url.username || url.password || url.search || url.hash) {
    return undefined;
  }

  const path = url.pathname.replace(/\/+$/, "");
  if (!path || path === "/") {
    url.pathname = "/v1";
  } else if (
    path.endsWith("/responses") ||
    path.endsWith("/chat/completions")
  ) {
    const basePath = path.replace(/\/(?:responses|chat\/completions)$/, "");
    if (basePath.endsWith("/v1") || basePath.endsWith("/v1/openai")) {
      url.pathname = basePath;
    } else {
      return undefined;
    }
  } else if (path.endsWith("/v1") || path.endsWith("/v1/openai")) {
    url.pathname = path;
  } else {
    return undefined;
  }

  return url.toString();
}
