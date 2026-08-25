import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const component = readFileSync(
  new URL("./transcript-view.tsx", import.meta.url),
  "utf8",
);

describe("TranscriptView", () => {
  it("follows a live partial transcript into view", () => {
    expect(component).toContain("scrollRef.current?.scrollToEnd");
    expect(component).toContain("[partial]");
  });
});
