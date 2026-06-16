import { describe, expect, it } from "vitest";
import {
  sanitizeTranscriptText,
  stripTrailingDuplicate,
} from "../src/lib/editor/model-hints.js";

describe("sanitizeTranscriptText", () => {
  it("strips trailing <fin> tags from raw transcripts", () => {
    expect(sanitizeTranscriptText("Hello there.<fin>")).toBe("Hello there.");
  });

  it("strips wrapping quotes around raw transcripts", () => {
    expect(sanitizeTranscriptText('"Quoted transcript.<fin>"')).toBe(
      "Quoted transcript.",
    );
  });

  it("strips trailing <fin> tags from gpt-oss output", () => {
    expect(
      sanitizeTranscriptText("Let's just do a remote Zoom call instead.<fin>"),
    ).toBe("Let's just do a remote Zoom call instead.");
  });
});

describe("stripTrailingDuplicate", () => {
  it("removes duplicated trailing paragraphs", () => {
    expect(stripTrailingDuplicate("Hello there.\n\nHello there.")).toBe(
      "Hello there.",
    );
  });
});
