import { describe, expect, it } from "vitest";
import {
  clampCompanionPosition,
  companionFacingForBounds,
  positionForCompanionDisplay,
} from "./companion-position";

const primaryDisplay = {
  id: 1,
  workArea: { x: 0, y: 0, width: 1440, height: 900 },
};
const secondaryDisplay = {
  id: 2,
  workArea: { x: 1440, y: 0, width: 1920, height: 1080 },
};
const size = { width: 256, height: 278 };

describe("companion display positions", () => {
  it("keeps a saved position inside the display work area", () => {
    expect(
      clampCompanionPosition({ x: -50, y: 2_000 }, primaryDisplay, size),
    ).toEqual({ x: 0, y: 622 });
  });

  it("uses a saved slot only on the display where it was placed", () => {
    const positions = { "1": { x: 80, y: 500 } };
    const fallback = { x: secondaryDisplay.workArea.x + 12, y: 790 };

    expect(
      positionForCompanionDisplay(primaryDisplay, size, positions, fallback),
    ).toEqual({ x: 80, y: 500 });
    expect(
      positionForCompanionDisplay(secondaryDisplay, size, positions, fallback),
    ).toEqual(fallback);
  });

  it("faces the companion inward from either half of its display", () => {
    expect(
      companionFacingForBounds({ x: 72, width: size.width }, primaryDisplay),
    ).toBe("right");
    expect(
      companionFacingForBounds({ x: 1_090, width: size.width }, primaryDisplay),
    ).toBe("left");
  });
});
