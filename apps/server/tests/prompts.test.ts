import { describe, expect, it } from "vitest";
import {
  buildLanguageBlock,
  buildRewritePrompt,
} from "../src/lib/editor/prompts.js";

describe("buildLanguageBlock", () => {
  it("returns nothing for auto-detect", () => {
    expect(buildLanguageBlock("auto")).toBe("");
    expect(buildLanguageBlock(undefined)).toBe("");
  });

  it("adds a same-language constraint for known languages", () => {
    expect(buildLanguageBlock("es")).toContain(
      "Return the final edited text in the same language and script.",
    );
    expect(buildLanguageBlock("es")).toContain("Do not translate");
  });

  it("adds a Chinese punctuation hint for Chinese locales", () => {
    expect(buildLanguageBlock("zh-Hans")).toContain(
      "Use standard Chinese punctuation.",
    );
  });
});

describe("buildRewritePrompt", () => {
  it("embeds the language block when a language is provided", () => {
    const prompt = buildRewritePrompt("hola", { language: "es" });
    expect(prompt.system).toContain("Language constraint:");
    expect(prompt.system).toContain("Do not translate");
  });
});
