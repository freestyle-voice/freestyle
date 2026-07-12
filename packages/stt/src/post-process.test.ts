import { describe, expect, it, vi } from "vitest";
import { postProcess } from "./post-process.js";

function fakeModel(doGenerate: () => never | Promise<never>) {
  return {
    specificationVersion: "v3",
    provider: "test",
    modelId: "fake-model",
    doGenerate,
  } as never;
}

describe("postProcess", () => {
  it("short-circuits filler-only text without calling the model", async () => {
    const doGenerate = vi.fn(() => {
      throw new Error("should not be called");
    });
    const result = await postProcess({
      model: fakeModel(doGenerate),
      system: "irrelevant — never reached",
      text: "um uh, you know...",
    });
    expect(result).toEqual({
      cleaned: "",
      model: null,
      inputTokens: 0,
      outputTokens: 0,
    });
    expect(doGenerate).not.toHaveBeenCalled();
  });

  it("does not short-circuit filler-only text when skipEmptyText is false", async () => {
    const doGenerate = vi.fn(async () => {
      throw new Error("boom");
    });
    const result = await postProcess({
      model: fakeModel(doGenerate),
      system: "irrelevant",
      text: "um uh",
      skipEmptyText: false,
    });
    expect(doGenerate).toHaveBeenCalled();
    // Falls back to sanitized raw text since the fake model throws.
    expect(result.cleaned).toBe("um uh");
  });

  it("falls back to sanitized raw text when the model call throws", async () => {
    const result = await postProcess({
      model: fakeModel(async () => {
        throw new Error("boom");
      }),
      system: "irrelevant — model throws before using it",
      text: '"hello there"',
    });
    expect(result.model).toBeNull();
    expect(result.cleaned).toBe("hello there");
  });

  it("takes the caller's system/prompt verbatim (no built-in tone or preset logic)", async () => {
    // We can't easily assert what was sent to generateText without a real
    // provider double, but we can assert the function accepts an arbitrary
    // caller-authored system prompt and a fully custom user prompt without
    // any tone/intensity/destination options.
    const result = await postProcess({
      model: fakeModel(async () => {
        throw new Error("boom");
      }),
      system: "You are a pirate. Rewrite everything in pirate speak.",
      prompt: "Ahoy, edit this: hello there",
      text: "hello there",
    });
    expect(result.cleaned).toBe("hello there");
  });

  it("calls onError with the raw error before falling back, without throwing", async () => {
    const boom = new Error("boom");
    const onError = vi.fn();
    const result = await postProcess({
      model: fakeModel(async () => {
        throw boom;
      }),
      system: "irrelevant",
      text: "hello there",
      onError,
    });
    expect(onError).toHaveBeenCalledWith(boom);
    expect(result.model).toBeNull();
    expect(result.cleaned).toBe("hello there");
  });

  it("never calls onError when the model call succeeds", async () => {
    const onError = vi.fn();
    const model = {
      specificationVersion: "v3",
      provider: "test",
      modelId: "fake-model",
      doGenerate: async () => ({
        content: [{ type: "text", text: "cleaned output" }],
        finishReason: "stop",
        usage: { inputTokens: 3, outputTokens: 2 },
        warnings: [],
      }),
    } as never;
    const result = await postProcess({
      model,
      system: "irrelevant",
      text: "hello there",
      onError,
    });
    expect(onError).not.toHaveBeenCalled();
    expect(result.model).toBe("fake-model");
    expect(result.cleaned).toBe("cleaned output");
  });
});
