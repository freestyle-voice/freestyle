import { describe, expect, it } from "vitest";
import { windowPositionForPillSlot } from "./pill-position";

describe("windowPositionForPillSlot", () => {
  it("keeps an expanded Remix pill anchored to the same collapsed slot", () => {
    expect(
      windowPositionForPillSlot({ x: 880, y: 1008 }, { dx: 140, dy: 540 }),
    ).toEqual({ x: 740, y: 468 });
  });
});
