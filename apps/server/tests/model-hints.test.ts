import { describe, expect, it } from "vitest";
import {
  cleanModelOutput,
  stripTrailingDuplicate,
} from "../src/lib/editor/model-hints.js";

describe("cleanModelOutput", () => {
  it("strips trailing <fin> tags from gpt-oss output", () => {
    expect(
      cleanModelOutput(
        "Let's just do a remote Zoom call instead.<fin>",
        "openai/gpt-oss-20b",
      ),
    ).toBe("Let's just do a remote Zoom call instead.");
  });

  it("strips qwen think tags and trailing <fin>", () => {
    expect(
      cleanModelOutput(
        "<think>hidden reasoning</think>\n最终我们远程开 Zoom 会议。<fin>",
        "qwen/qwen3-32b",
      ),
    ).toBe("最终我们远程开 Zoom 会议。");
  });
});

describe("stripTrailingDuplicate", () => {
  it("removes duplicated trailing paragraphs", () => {
    expect(stripTrailingDuplicate("Hello there.\n\nHello there.")).toBe(
      "Hello there.",
    );
  });
});
