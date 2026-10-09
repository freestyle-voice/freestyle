import { beforeEach, describe, expect, it, vi } from "vitest";
import { writeSetting } from "../src/lib/db.js";

const doGenerate = vi.fn(() => {
  throw new Error("an oversized cleanup request must not reach the provider");
});
const captureException = vi.fn();

vi.mock("../src/lib/providers.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/lib/providers.js")>();
  return {
    ...actual,
    createCleanupModel: vi.fn().mockResolvedValue({
      specificationVersion: "v3",
      provider: "test",
      modelId: "qwen/qwen3.8-27b",
      doGenerate,
    }),
    getDefaultModels: () => ({
      llm: { provider: "groq", model_id: "qwen/qwen3.8-27b" },
    }),
  };
});

vi.mock("../src/routes/models.js", () => ({
  getModelCostCached: () => null,
  isCleanupModelSupported: async () => true,
}));

vi.mock("../src/lib/sentry.js", () => ({
  capture: vi.fn(),
  captureException,
}));

const { postProcess } = await import("../src/lib/post-process.js");

describe("postProcess — provider input budget", () => {
  beforeEach(() => {
    doGenerate.mockClear();
    captureException.mockClear();
    writeSetting("llm_cleanup", "true");
  });

  it("returns the raw text without reporting an oversized Groq cleanup prompt", async () => {
    const rawText = "word ".repeat(6_000).trim();

    const result = await postProcess(rawText, null);

    expect(doGenerate).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
    expect(result.cleaned).toBe(rawText);
    expect(result.llmProvider).toBeNull();
    expect(result.llmModel).toBeNull();
  });
});
