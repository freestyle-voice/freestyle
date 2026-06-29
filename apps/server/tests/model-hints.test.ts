import { describe, expect, it } from "vitest";
import {
  collapseAsrLineBreaks,
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

describe("collapseAsrLineBreaks", () => {
  it("collapses per-segment line breaks into spaces", () => {
    expect(
      collapseAsrLineBreaks("This is the first segment.\nAnd the second one."),
    ).toBe("This is the first segment. And the second one.");
  });

  it("preserves blank-line paragraph breaks", () => {
    expect(collapseAsrLineBreaks("First paragraph.\n\nSecond paragraph.")).toBe(
      "First paragraph.\n\nSecond paragraph.",
    );
  });

  it("collapses runs of more than two line breaks to a single paragraph break", () => {
    expect(collapseAsrLineBreaks("One.\n\n\n\nTwo.")).toBe("One.\n\nTwo.");
  });

  it("collapses a paragraph break with interleaved whitespace cleanly", () => {
    expect(collapseAsrLineBreaks("One.\n\n  \nTwo.")).toBe("One.\n\nTwo.");
  });

  it("normalizes Windows CRLF line endings", () => {
    expect(collapseAsrLineBreaks("Line one.\r\nLine two.")).toBe(
      "Line one. Line two.",
    );
  });

  it("trims surrounding whitespace around collapsed breaks", () => {
    expect(collapseAsrLineBreaks("Word one.  \n  word two.")).toBe(
      "Word one. word two.",
    );
  });

  it("leaves single-line text untouched", () => {
    expect(collapseAsrLineBreaks("Just one line.")).toBe("Just one line.");
  });
});

describe("stripTrailingDuplicate", () => {
  it("removes duplicated trailing paragraphs", () => {
    expect(stripTrailingDuplicate("Hello there.\n\nHello there.")).toBe(
      "Hello there.",
    );
  });
});
