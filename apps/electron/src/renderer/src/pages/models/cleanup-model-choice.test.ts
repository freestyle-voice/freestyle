import { describe, expect, it } from "vitest";
import {
  manualCleanupModel,
  withSelectedCleanupModel,
} from "./cleanup-model-choice";

describe("manual cleanup models", () => {
  it("preserves the exact OpenRouter vendor/model ID behind the app prefix", () => {
    expect(
      manualCleanupModel("openrouter", "  vendor/new-model:free  ")?.model_id,
    ).toBe("openrouter/vendor/new-model:free");
    expect(manualCleanupModel("openrouter", "openrouter/auto")?.model_id).toBe(
      "openrouter/openrouter/auto",
    );
  });

  it("allows registered API providers without allowing managed or unknown providers", () => {
    expect(
      manualCleanupModel("anthropic", "new-private-model")?.provider_id,
    ).toBe("anthropic");
    expect(manualCleanupModel("freestyle-cloud", "anything")).toBeNull();
    expect(manualCleanupModel("unregistered", "anything")).toBeNull();
    expect(manualCleanupModel("openai", "  ")).toBeNull();
  });

  it("accepts a custom endpoint model without requiring model discovery", () => {
    expect(
      manualCleanupModel("local-llm", "my-org/private-model", true)?.model_id,
    ).toBe("local-llm/my-org/private-model");
    expect(manualCleanupModel("local-llm", "my-org/private-model")).toBeNull();
  });

  it("keeps a selected manual model visible when discovery returns no models", () => {
    const selected = {
      provider: "openrouter",
      model_id: "openrouter/vendor/new-model",
      model_name: "My model",
    };
    expect(withSelectedCleanupModel([], selected)).toEqual([
      {
        provider_id: "openrouter",
        provider_name: "OpenRouter",
        model_id: "openrouter/vendor/new-model",
        model_name: "My model",
        type: "llm",
        curated: true,
      },
    ]);
  });

  it("does not duplicate a selected model already returned by discovery", () => {
    const catalog = [
      {
        provider_id: "openrouter",
        provider_name: "OpenRouter",
        model_id: "vendor/model",
        model_name: "Model",
        type: "llm" as const,
      },
    ];
    expect(
      withSelectedCleanupModel(catalog, {
        provider: "openrouter",
        model_id: "openrouter/vendor/model",
        model_name: "Model",
      }),
    ).toEqual(catalog);
  });
});
