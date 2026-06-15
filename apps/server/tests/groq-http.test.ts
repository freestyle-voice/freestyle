import { describe, expect, it } from "vitest";
import { normalizeGroqModelId } from "../src/lib/groq-http.js";

describe("normalizeGroqModelId", () => {
  it("strips only the groq provider prefix", () => {
    expect(normalizeGroqModelId("groq/llama-3.1-8b-instant")).toBe(
      "llama-3.1-8b-instant",
    );
    expect(normalizeGroqModelId("groq/openai/gpt-oss-20b")).toBe(
      "openai/gpt-oss-20b",
    );
  });

  it("preserves nested vendor prefixes for Groq-hosted models", () => {
    expect(normalizeGroqModelId("openai/gpt-oss-20b")).toBe(
      "openai/gpt-oss-20b",
    );
    expect(normalizeGroqModelId("qwen/qwen3-32b")).toBe("qwen/qwen3-32b");
    expect(normalizeGroqModelId("mistral-saba-24b")).toBe("mistral-saba-24b");
  });
});
