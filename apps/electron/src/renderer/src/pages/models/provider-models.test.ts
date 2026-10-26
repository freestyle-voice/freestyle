import type { AvailableModel } from "@renderer/lib/models";
import { describe, expect, it } from "vitest";
import {
  connectedProviderIds,
  filterProviderModels,
  withConfiguredCleanupModels,
} from "./provider-models";

const catalog: AvailableModel[] = [
  {
    provider_id: "openai",
    provider_name: "OpenAI",
    model_id: "gpt-shared",
    model_name: "Shared",
    type: "llm",
  },
  {
    provider_id: "anthropic",
    provider_name: "Anthropic",
    model_id: "claude-private",
    model_name: "Claude",
    type: "llm",
  },
  {
    provider_id: "openrouter",
    provider_name: "OpenRouter",
    model_id: "openai/gpt-shared",
    model_name: "Shared",
    type: "llm",
    gateway: "OpenRouter",
    curated: false,
  },
];

describe("connected provider model inventory", () => {
  it("includes saved unverified keys but excludes invalid keys from connections", () => {
    expect([
      ...connectedProviderIds([
        { provider: "openai", status: "valid" },
        { provider: "openrouter", status: "unknown" },
        { provider: "anthropic", status: "invalid" },
      ]),
    ]).toEqual(["openai", "openrouter"]);
  });

  it("combines all connected catalogs including non-curated gateway models", () => {
    expect(
      filterProviderModels(
        catalog,
        new Set(["openai", "openrouter"]),
        [],
        "",
      ).map((m) => `${m.provider_id}:${m.model_id}`),
    ).toEqual(["openai:gpt-shared", "openrouter:openai/gpt-shared"]);
  });

  it("supports several provider filters and searches exact namespaced model IDs", () => {
    expect(
      filterProviderModels(
        catalog,
        new Set(["openai", "anthropic", "openrouter"]),
        ["openai", "openrouter"],
        "openai/gpt-shared",
      ).map((m) => m.provider_id),
    ).toEqual(["openrouter"]);
    expect(
      filterProviderModels(
        catalog,
        new Set(["openai", "anthropic", "openrouter"]),
        ["anthropic", "openrouter"],
        "",
      ).map((m) => m.provider_id),
    ).toEqual(["anthropic", "openrouter"]);
  });

  it("keeps managed and local models out of the API provider inventory", () => {
    expect(
      filterProviderModels(
        [
          {
            provider_id: "freestyle-cloud",
            provider_name: "Freestyle",
            model_id: "cleanup",
            model_name: "Managed",
            type: "llm",
          },
          {
            provider_id: "local-llm",
            provider_name: "Local",
            model_id: "private",
            model_name: "Private",
            type: "llm",
          },
        ],
        new Set(),
        [],
        "",
        true,
      ),
    ).toEqual([]);
  });

  it("only exposes disconnected catalogs after deliberate browsing", () => {
    expect(filterProviderModels(catalog, new Set(), [], "")).toEqual([]);
    expect(filterProviderModels(catalog, new Set(), [], "", true)).toEqual(
      catalog,
    );
  });

  it("keeps every configured text model missing from discovery with one routing prefix", () => {
    const models = withConfiguredCleanupModels(catalog, [
      {
        provider: "openrouter",
        model_id: "openrouter/openai/gpt-shared",
        model_name: "Duplicate",
        type: "remix",
      },
      {
        provider: "openrouter",
        model_id: "openrouter/openrouter/auto",
        model_name: "Auto",
        type: "llm",
      },
      {
        provider: "anthropic",
        model_id: "anthropic/private-older",
        model_name: "Older",
        type: "llm",
      },
      {
        provider: "openai",
        model_id: "openai/whisper",
        model_name: "Voice",
        type: "voice",
      },
    ]);
    expect(models.slice(3).map((m) => [m.provider_id, m.model_id])).toEqual([
      ["openrouter", "openrouter/auto"],
      ["anthropic", "private-older"],
    ]);
    expect(
      models.filter((m) => m.model_id === "openai/gpt-shared"),
    ).toHaveLength(1);
  });
});
