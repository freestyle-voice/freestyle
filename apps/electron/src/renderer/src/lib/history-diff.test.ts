import { describe, expect, it } from "vitest";
import { diffWords } from "./history-diff";

/** Reconstruct the raw text from the segments the diff kept from it. */
function rebuildRaw(segments: ReturnType<typeof diffWords>): string {
  return segments
    .filter((s) => s.type !== "add")
    .map((s) => s.text)
    .join("");
}

/** Reconstruct the cleaned text from the segments the diff kept from it. */
function rebuildCleaned(segments: ReturnType<typeof diffWords>): string {
  return segments
    .filter((s) => s.type !== "del")
    .map((s) => s.text)
    .join("");
}

describe("diffWords", () => {
  it("round-trips: del+same rebuild raw, add+same rebuild cleaned", () => {
    const raw = "um so I think we should uh ship it tomorrow";
    const cleaned = "I think we should ship it tomorrow.";

    const segments = diffWords(raw, cleaned);

    expect(rebuildRaw(segments)).toBe(raw);
    expect(rebuildCleaned(segments)).toBe(cleaned);
  });

  it("marks removed and added words", () => {
    const segments = diffWords("the quick brown fox", "the quick red fox");

    const removed = segments
      .filter((s) => s.type === "del")
      .map((s) => s.text.trim());
    const added = segments
      .filter((s) => s.type === "add")
      .map((s) => s.text.trim());

    expect(removed).toContain("brown");
    expect(added).toContain("red");
  });

  it("returns a single unchanged segment when texts are identical", () => {
    const segments = diffWords("hello world", "hello world");

    expect(segments).toEqual([{ type: "same", text: "hello world" }]);
  });

  it("diffs spaceless scripts word-by-word, not as one blob (CJK)", () => {
    // Japanese: only the trailing です is removed.
    const segments = diffWords(
      "昨日私は東京に行きましたです",
      "昨日私は東京に行きました",
    );

    // There must be an unchanged portion — the whole thing is not one del+add pair.
    expect(segments.some((s) => s.type === "same")).toBe(true);
    expect(
      segments
        .filter((s) => s.type === "del")
        .map((s) => s.text)
        .join(""),
    ).toBe("です");
    expect(rebuildRaw(segments)).toBe("昨日私は東京に行きましたです");
    expect(rebuildCleaned(segments)).toBe("昨日私は東京に行きました");
  });
});
