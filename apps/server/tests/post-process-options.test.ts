import { describe, expect, it } from "vitest";
import {
  getMiniMaxModelMetadata,
  minimaxCleanupProviderOptions,
} from "../src/lib/llm/minimax.js";
import { groqCleanupProviderOptions } from "../src/lib/llm/registry.js";

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

describe("minimaxCleanupProviderOptions", () => {
  it("disables optional thinking for M3 cleanup", () => {
    expect(minimaxCleanupProviderOptions("MiniMax-M3")).toEqual({
      anthropic: {
        thinking: { type: "disabled" },
      },
    });
    expect(minimaxCleanupProviderOptions("minimax-cn/MiniMax-M3")).toEqual({
      anthropic: {
        thinking: { type: "disabled" },
      },
    });
  });

  it("keeps always-on thinking unchanged for M2.7 cleanup", () => {
    expect(minimaxCleanupProviderOptions("MiniMax-M2.7")).toBeUndefined();
  });

  it("exposes the current model metadata for both regions", () => {
    expect(getMiniMaxModelMetadata("minimax", "MiniMax-M3")).toMatchObject({
      contextWindow: 1_000_000,
      pricing: { input: 0.6, output: 2.4, cacheRead: 0.12 },
      inputModalities: ["text", "image", "video"],
      thinking: ["adaptive", "disabled"],
    });
    expect(getMiniMaxModelMetadata("minimax-cn", "MiniMax-M2.7")).toMatchObject(
      {
        contextWindow: 204_800,
        pricing: {
          input: 0.3,
          output: 1.2,
          cacheRead: 0.06,
          cacheWrite: 0.375,
        },
        inputModalities: ["text"],
        thinking: ["always_on"],
      },
    );
  });
});
