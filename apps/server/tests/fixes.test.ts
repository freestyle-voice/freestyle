import { describe, expect, it } from "vitest";
import { countFixes } from "../src/lib/fixes.js";

describe("countFixes", () => {
  it("returns 0 when cleanup made no change", () => {
    expect(countFixes("hello world", null)).toBe(0);
    expect(countFixes("hello world", "hello world")).toBe(0);
  });

  it("counts a single-word replacement as one fix", () => {
    expect(countFixes("helo world", "hello world")).toBe(1);
  });

  it("counts insertions and deletions by word", () => {
    // Two words inserted.
    expect(countFixes("send the report", "please send the report now")).toBe(2);
    // Two words removed.
    expect(countFixes("um so send the report", "send the report")).toBe(2);
  });

  it("counts a multi-word replacement as the larger side", () => {
    expect(countFixes("i cant go", "I cannot go")).toBe(2);
  });
});
