import { describe, expect, it } from "vitest";
import { groqCleanupProviderOptions } from "../src/lib/post-process.js";

describe("groqCleanupProviderOptions", () => {
  it("disables visible reasoning for qwen3 cleanup", () => {
    expect(groqCleanupProviderOptions("qwen/qwen3-32b")).toEqual({
      groq: {
        reasoningFormat: "hidden",
        reasoningEffort: "none",
      },
    });
  });

  it("keeps hidden low-effort reasoning for gpt-oss cleanup", () => {
    expect(groqCleanupProviderOptions("openai/gpt-oss-20b")).toEqual({
      groq: {
        reasoningFormat: "hidden",
        reasoningEffort: "low",
      },
    });
    expect(groqCleanupProviderOptions("groq/openai/gpt-oss-120b")).toEqual({
      groq: {
        reasoningFormat: "hidden",
        reasoningEffort: "low",
      },
    });
  });

  it("leaves non-reasoning groq models alone", () => {
    expect(groqCleanupProviderOptions("llama-3.1-8b-instant")).toBeUndefined();
  });
});
