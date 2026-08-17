import { describe, expect, it } from "vitest";
import { speechBubbleLayout } from "./speech-bubble-layout";

describe("speechBubbleLayout", () => {
  it("keeps Jeb's bubble close to his face with a short tail", () => {
    const layout = speechBubbleLayout({
      windowSize: 256,
      anchor: { x: 122, y: 154 },
    });

    expect(layout).toEqual({
      bubble: { left: 98, bottom: 116 },
      tail: { left: 15, bottom: -14 },
    });
  });
});
