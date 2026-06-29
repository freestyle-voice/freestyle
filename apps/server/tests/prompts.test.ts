import { CLEANUP_PRESET_PROMPTS } from "@freestyle-voice/validations";
import { describe, expect, it } from "vitest";
import {
  buildLanguageBlock,
  buildRewritePrompt,
  resolveBaseCleanupPrompt,
} from "../src/lib/editor/prompts.js";

describe("buildLanguageBlock", () => {
  it("keeps the source language for auto-detect instead of translating", () => {
    for (const value of ["auto", undefined]) {
      const block = buildLanguageBlock(value);
      expect(block).toContain(
        "return the final edited text in the same language and script",
      );
      expect(block).toContain("Do not translate");
    }
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

  it("defaults to the low preset when no intensity is given", () => {
    const prompt = buildRewritePrompt("hi");
    expect(prompt.system.startsWith(CLEANUP_PRESET_PROMPTS.low)).toBe(true);
  });

  it("uses the matching preset for each intensity", () => {
    expect(
      buildRewritePrompt("hi", { intensity: "medium" }).system.startsWith(
        CLEANUP_PRESET_PROMPTS.medium,
      ),
    ).toBe(true);
    expect(
      buildRewritePrompt("hi", { intensity: "high" }).system.startsWith(
        CLEANUP_PRESET_PROMPTS.high,
      ),
    ).toBe(true);
  });

  it("uses the custom prompt when intensity is custom", () => {
    const prompt = buildRewritePrompt("hi", {
      intensity: "custom",
      customPrompt: "Just uppercase everything.",
      language: "es",
    });
    expect(prompt.system.startsWith("Just uppercase everything.")).toBe(true);
    // Dynamic blocks still get appended for custom prompts.
    expect(prompt.system).toContain("Language constraint:");
  });
});

describe("resolveBaseCleanupPrompt", () => {
  it("falls back to the low preset for an empty custom prompt", () => {
    expect(resolveBaseCleanupPrompt("custom", "   ")).toBe(
      CLEANUP_PRESET_PROMPTS.low,
    );
    expect(resolveBaseCleanupPrompt("custom", undefined)).toBe(
      CLEANUP_PRESET_PROMPTS.low,
    );
  });

  it("trims and returns a provided custom prompt", () => {
    expect(resolveBaseCleanupPrompt("custom", "  do x  ")).toBe("do x");
  });
});
