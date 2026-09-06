import { describe, expect, it } from "vitest";
import { resolveMlxLanguageSelection } from "../src/lib/mlx-asr/language.js";

describe("resolveMlxLanguageSelection", () => {
  it("biases Qwen when exactly one language is selected", () => {
    expect(resolveMlxLanguageSelection("qwen3-0.6b-8bit", ["hi"])).toBe(
      "Hindi",
    );
  });

  it("uses auto-detect for multiple selected languages", () => {
    expect(
      resolveMlxLanguageSelection("qwen3-0.6b-8bit", ["en", "hi"]),
    ).toBeUndefined();
  });

  it("uses auto-detect when the configured Qwen model includes its provider", () => {
    expect(
      resolveMlxLanguageSelection("local-mlx/qwen3-0.6b-8bit", ["en", "hi"]),
    ).toBeUndefined();
  });

  it("uses auto-detect when no language is selected", () => {
    expect(resolveMlxLanguageSelection("qwen3-0.6b-8bit", [])).toBeUndefined();
  });
});
