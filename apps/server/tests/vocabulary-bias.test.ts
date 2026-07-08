import { describe, expect, it } from "vitest";
import { buildAsrVocabularyBias } from "../src/lib/vocabulary-bias.js";

function terms(count: number, prefix = "term"): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}${i}`);
}

describe("buildAsrVocabularyBias", () => {
  describe("empty input", () => {
    it("returns null when there are no terms", () => {
      expect(buildAsrVocabularyBias("openai", "whisper-1", [])).toBeNull();
      expect(buildAsrVocabularyBias("deepgram", "nova-3", [], true)).toBeNull();
    });

    it("returns null for unknown providers", () => {
      expect(
        buildAsrVocabularyBias("unknown", "model", ["Freestyle"]),
      ).toBeNull();
    });
  });

  describe("prompt providers (openai, groq, local-whisper)", () => {
    it.each([
      "openai",
      "groq",
      "local-whisper",
    ] as const)("builds prompt bias for %s", (providerId) => {
      const bias = buildAsrVocabularyBias(providerId, "whisper-1", [
        "TypeScript",
        "Kubernetes",
      ]);
      expect(bias).toEqual({
        kind: "prompt",
        text: "Terms: TypeScript, Kubernetes.",
      });
    });

    it("deduplicates terms case-insensitively", () => {
      const bias = buildAsrVocabularyBias("openai", "whisper-1", [
        "React",
        "react",
        "REACT",
      ]);
      expect(bias).toEqual({ kind: "prompt", text: "Terms: React." });
    });

    it("trims whitespace and skips empty terms", () => {
      const bias = buildAsrVocabularyBias("openai", "whisper-1", [
        "  alpha  ",
        "",
        "   ",
        "beta",
      ]);
      expect(bias).toEqual({ kind: "prompt", text: "Terms: alpha, beta." });
    });

    it("caps prompt text at 900 characters", () => {
      const longTerms = terms(200, "abcdefghij");
      const bias = buildAsrVocabularyBias("openai", "whisper-1", longTerms);
      expect(bias?.kind).toBe("prompt");
      if (bias?.kind === "prompt") {
        expect(bias.text.length).toBeLessThanOrEqual(900);
        expect(bias.text.startsWith("Terms:")).toBe(true);
      }
    });

    it("strips provider prefix from model id", () => {
      const bias = buildAsrVocabularyBias(
        "local-whisper",
        "local-whisper/base",
        ["Freestyle"],
      );
      expect(bias).toEqual({ kind: "prompt", text: "Terms: Freestyle." });
    });
  });

  describe("deepgram", () => {
    it("uses keyterms for nova-3 batch requests", () => {
      const bias = buildAsrVocabularyBias(
        "deepgram",
        "deepgram/nova-3",
        ["Freestyle", "Kubernetes"],
        false,
      );
      expect(bias).toEqual({
        kind: "deepgram-keyterms",
        terms: ["Freestyle", "Kubernetes"],
      });
    });

    it("caps nova-3 streaming keyterms at 25", () => {
      const bias = buildAsrVocabularyBias(
        "deepgram",
        "nova-3-general",
        terms(40),
        true,
      );
      expect(bias?.kind).toBe("deepgram-keyterms");
      if (bias?.kind === "deepgram-keyterms") {
        expect(bias.terms).toHaveLength(25);
      }
    });

    it("caps nova-3 batch keyterms at 100", () => {
      const bias = buildAsrVocabularyBias(
        "deepgram",
        "nova-3",
        terms(150),
        false,
      );
      expect(bias?.kind).toBe("deepgram-keyterms");
      if (bias?.kind === "deepgram-keyterms") {
        expect(bias.terms).toHaveLength(100);
      }
    });

    it("expands nova-2 phrases into keyword tokens", () => {
      const bias = buildAsrVocabularyBias(
        "deepgram",
        "nova-2",
        ["account number", "TypeScript"],
        false,
      );
      expect(bias).toEqual({
        kind: "deepgram-keywords",
        terms: ["account", "number", "TypeScript"],
      });
    });

    it("returns null for unsupported deepgram models", () => {
      expect(
        buildAsrVocabularyBias("deepgram", "whisper-large", ["Freestyle"]),
      ).toBeNull();
    });
  });

  describe("elevenlabs", () => {
    it("uses keyterms for scribe_v2 batch requests", () => {
      const bias = buildAsrVocabularyBias(
        "elevenlabs",
        "scribe_v2",
        ["Freestyle", "Nguyen"],
        false,
      );
      expect(bias).toEqual({
        kind: "elevenlabs-keyterms",
        terms: ["Freestyle", "Nguyen"],
      });
    });

    it("returns null for scribe_v1", () => {
      expect(
        buildAsrVocabularyBias("elevenlabs", "scribe_v1", ["Freestyle"]),
      ).toBeNull();
    });

    it("caps streaming keyterms at 50", () => {
      const bias = buildAsrVocabularyBias(
        "elevenlabs",
        "scribe_v2_realtime",
        terms(60),
        true,
      );
      expect(bias?.kind).toBe("elevenlabs-keyterms");
      if (bias?.kind === "elevenlabs-keyterms") {
        expect(bias.terms).toHaveLength(50);
      }
    });

    it("truncates streaming terms longer than 20 chars", () => {
      const bias = buildAsrVocabularyBias(
        "elevenlabs",
        "scribe_v2_realtime",
        ["abcdefghijklmnopqrstuvwxyz"],
        true,
      );
      expect(bias).toEqual({
        kind: "elevenlabs-keyterms",
        terms: ["abcdefghijklmnopqrst"],
      });
    });

    it("allows longer terms in batch mode (50 chars)", () => {
      const longTerm = "a".repeat(60);
      const bias = buildAsrVocabularyBias(
        "elevenlabs",
        "scribe_v2",
        [longTerm],
        false,
      );
      expect(bias).toEqual({
        kind: "elevenlabs-keyterms",
        terms: ["a".repeat(50)],
      });
    });
  });

  describe("local-mlx", () => {
    it("builds mlx prompt with technical terms prefix", () => {
      const bias = buildAsrVocabularyBias("local-mlx", "qwen", [
        "TypeScript",
        "Kubernetes",
      ]);
      expect(bias).toEqual({
        kind: "prompt",
        text: "Technical terms: TypeScript, Kubernetes",
      });
    });
  });
});

describe("resolveAsrVocabularyBias", () => {
  it("loads terms from the database", async () => {
    const { getDb } = await import("../src/lib/db.js");
    const { resolveAsrVocabularyBias } = await import(
      "../src/lib/vocabulary-bias.js"
    );

    const db = getDb();
    db.prepare("INSERT INTO vocabulary (term, notes) VALUES (?, ?)").run(
      "Freestyle",
      null,
    );

    const bias = resolveAsrVocabularyBias("openai", "whisper-1", false);
    expect(bias?.kind).toBe("prompt");
    if (bias?.kind === "prompt") {
      expect(bias.text).toContain("Freestyle");
    }
  });
});
