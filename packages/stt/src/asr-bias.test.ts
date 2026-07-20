import { describe, expect, it } from "vitest";
import { buildAsrBiasPrompt } from "./asr-bias.js";

describe("buildAsrBiasPrompt", () => {
  it("returns undefined when there is nothing to bias with", () => {
    expect(buildAsrBiasPrompt({})).toBeUndefined();
    expect(buildAsrBiasPrompt({ terms: [], context: "  " })).toBeUndefined();
  });

  it("de-duplicates terms case-insensitively, keeping first-seen casing", () => {
    const prompt = buildAsrBiasPrompt({ terms: ["API", "api", "GraphQL"] });
    expect(prompt).toBe("Terms: API, GraphQL.");
  });

  it("prepends free-text context ahead of the terms list", () => {
    const prompt = buildAsrBiasPrompt({
      context: "Backend engineering standup notes.",
      terms: ["Kubernetes", "gRPC"],
    });
    expect(prompt).toBe(
      "Backend engineering standup notes. Terms: Kubernetes, gRPC.",
    );
  });

  it("keeps packing shorter terms after a longer term overflows the budget (no early bail-out)", () => {
    // Regression test: callers commonly pass terms sorted longest-first
    // (e.g. Freestyle's `GET /vocabulary/all` orders by length DESC). A
    // naive packer that stops at the first term it can't fit would silently
    // drop every shorter term that comes after. This must keep trying.
    const longTerm = "x".repeat(50);
    const shortTerm = "ok";
    const prompt = buildAsrBiasPrompt(
      { terms: [longTerm, shortTerm] },
      { maxChars: 20 }, // deliberately too small to fit longTerm
    );
    expect(prompt).toContain(shortTerm);
    expect(prompt).not.toContain(longTerm);
  });

  it("reserves a minimum budget for terms even when context is very long", () => {
    const longContext = "background ".repeat(200); // ~2200 chars
    const prompt = buildAsrBiasPrompt(
      { context: longContext, terms: ["Kubernetes"] },
      { maxChars: 900, minTermsChars: 200 },
    );
    expect(prompt).toContain("Terms: Kubernetes.");
  });

  it("never exceeds the configured maxChars", () => {
    const longContext = "word ".repeat(500);
    const manyTerms = Array.from({ length: 50 }, (_, i) => `term-${i}`);
    const prompt = buildAsrBiasPrompt(
      { context: longContext, terms: manyTerms },
      { maxChars: 300 },
    );
    expect(prompt).toBeDefined();
    expect(prompt!.length).toBeLessThanOrEqual(300);
  });

  it("truncates long context at a word boundary instead of mid-word", () => {
    const context = "alpha beta gamma delta epsilon zeta eta theta";
    const prompt = buildAsrBiasPrompt({ context }, { maxChars: 20 });
    // Should not end mid-word (no dangling partial token stuck to a cut).
    expect(prompt).toMatch(/^[a-z ]+$/);
    expect(context.startsWith(prompt!)).toBe(true);
  });

  it("respects a custom maxChars override", () => {
    const prompt = buildAsrBiasPrompt(
      { terms: ["a", "b", "c"] },
      { maxChars: 1000 },
    );
    expect(prompt).toBe("Terms: a, b, c.");
  });
});
