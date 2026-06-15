import {
  normalizeOpenApiCompatibleEndpoint,
  OPENAPI_ENDPOINT_PRESETS,
} from "@freestyle/validations";
import { describe, expect, it } from "vitest";
import {
  buildOpenApiCompatibleHeaders,
  canUseManualOpenApiCompatibleModelSelection,
  getOpenApiCompatibleManualModelHint,
  getOpenApiCompatibleProviderLabel,
  isAzureOpenAiEndpoint,
} from "../src/lib/openapi-compatible.js";

describe("OpenAPI-compatible endpoint helpers", () => {
  it("normalizes OpenAPI-compatible endpoints to a /v1 base", () => {
    expect(
      normalizeOpenApiCompatibleEndpoint(
        "https://example.com/v1/chat/completions",
      ),
    ).toBe("https://example.com/v1");
    expect(
      normalizeOpenApiCompatibleEndpoint("http://localhost:4000/v1/responses"),
    ).toBe("http://localhost:4000/v1");
    expect(
      normalizeOpenApiCompatibleEndpoint("https://api.moonshot.cn/v1"),
    ).toBe("https://api.moonshot.cn/v1");
    expect(
      normalizeOpenApiCompatibleEndpoint(
        "https://api.deepinfra.com/v1/openai/chat/completions",
      ),
    ).toBe("https://api.deepinfra.com/v1/openai");
  });

  it("rejects non-local plain-http endpoints", () => {
    expect(
      normalizeOpenApiCompatibleEndpoint("http://example.com/v1"),
    ).toBeUndefined();
  });

  it("adds provider-specific auth headers for Azure and generic gateways", () => {
    expect(
      isAzureOpenAiEndpoint("https://demo.openai.azure.com/openai/v1"),
    ).toBe(true);
    expect(
      buildOpenApiCompatibleHeaders(
        "https://demo.openai.azure.com/openai/v1",
        "azure-key",
      ),
    ).toEqual(
      expect.objectContaining({
        Authorization: "Bearer azure-key",
        "api-key": "azure-key",
      }),
    );

    expect(
      buildOpenApiCompatibleHeaders("https://api.moonshot.cn/v1", "moon-key"),
    ).toEqual(
      expect.objectContaining({
        Authorization: "Bearer moon-key",
        "x-api-key": "moon-key",
      }),
    );
  });

  it("labels imported OpenPets presets clearly", () => {
    expect(
      getOpenApiCompatibleProviderLabel("https://openrouter.ai/api/v1"),
    ).toBe("OpenRouter");
    expect(getOpenApiCompatibleProviderLabel("https://api.openai.com/v1")).toBe(
      "OpenAI",
    );
    expect(
      getOpenApiCompatibleProviderLabel("https://api.moonshot.cn/v1"),
    ).toBe("Moonshot");
    expect(
      getOpenApiCompatibleProviderLabel("https://api.together.ai/v1"),
    ).toBe("Together AI");
    expect(
      getOpenApiCompatibleProviderLabel(
        "https://api.fireworks.ai/inference/v1",
      ),
    ).toBe("Fireworks AI");
    expect(
      getOpenApiCompatibleProviderLabel("https://api.deepinfra.com/v1/openai"),
    ).toBe("DeepInfra");
    expect(
      getOpenApiCompatibleProviderLabel("https://api.sambanova.ai/v1"),
    ).toBe("SambaNova");
    expect(getOpenApiCompatibleProviderLabel("http://localhost:11434/v1")).toBe(
      "Local OpenAPI",
    );
  });

  it("covers the curated OpenAPI-compatible presets", () => {
    expect(OPENAPI_ENDPOINT_PRESETS.map((preset) => preset.id)).toEqual(
      expect.arrayContaining([
        "openrouter",
        "azure",
        "litellm-local",
        "together",
        "fireworks",
        "https-template",
      ]),
    );
  });

  it("allows manual model selection when shared model discovery is unavailable", () => {
    expect(canUseManualOpenApiCompatibleModelSelection(404)).toBe(true);
    expect(canUseManualOpenApiCompatibleModelSelection(401)).toBe(false);
    expect(
      getOpenApiCompatibleManualModelHint(
        "https://demo.openai.azure.com/openai/v1",
      ),
    ).toContain("deployment");
  });
});
