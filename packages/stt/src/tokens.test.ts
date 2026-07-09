import { describe, expect, it } from "vitest";
import { maxOutputTokensForCleanup } from "./tokens.js";

describe("maxOutputTokensForCleanup", () => {
  it("uses floor for short input", () => {
    expect(maxOutputTokensForCleanup("hello")).toBe(512);
  });

  it("scales with input length", () => {
    const medium = "word ".repeat(200).trim();
    expect(maxOutputTokensForCleanup(medium)).toBeGreaterThan(512);
    expect(maxOutputTokensForCleanup(medium)).toBeLessThan(8192);
  });

  it("caps at maximum for very long input", () => {
    const long = "word ".repeat(10_000).trim();
    expect(maxOutputTokensForCleanup(long)).toBe(8192);
  });
});
