import { describe, expect, it } from "vitest";

import { canInsertKeyboardFinal, reduceRemixEvent } from "./reducer";

describe("Remix keyboard turn state", () => {
  it("permits one nonblank keyboard final insertion", () => {
    const ready = reduceRemixEvent(undefined, {
      type: "final-tool-request",
      text: "Hello Maya",
    });

    expect(canInsertKeyboardFinal(ready)).toBe(true);
    expect(
      canInsertKeyboardFinal(reduceRemixEvent(ready, { type: "inserted" })),
    ).toBe(false);
  });

  it("returns to idle instead of auto-listening after an insertion", () => {
    const next = reduceRemixEvent(undefined, { type: "inserted" });

    expect(next.phase).toBe("idle");
  });

  it("auto-listens after a Remix question when the preference is enabled", () => {
    const next = reduceRemixEvent(undefined, {
      type: "question",
      text: "Should I mention the price change?",
      autoListen: true,
    });

    expect(next).toMatchObject({
      phase: "listening",
      question: "Should I mention the price change?",
    });
  });

  it("waits for a mic tap after a Remix question when auto-listen is disabled", () => {
    const next = reduceRemixEvent(undefined, {
      type: "question",
      text: "Should I mention the price change?",
      autoListen: false,
    });

    expect(next.phase).toBe("question");
  });
});
