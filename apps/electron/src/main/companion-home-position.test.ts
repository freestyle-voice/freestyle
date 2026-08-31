import { describe, expect, it } from "vitest";
import { COMPANION_DOCK, COMPANION_DOCK_CLEARANCE } from "../shared/companion";
import { companionHomePosition } from "../shared/companion-position";

const display = {
  id: 1,
  workArea: { x: 0, y: 0, width: 1440, height: 900 },
};

describe("companion default home", () => {
  it("uses a compact dock while retaining a comfortable gap below the sprite", () => {
    expect(COMPANION_DOCK).toEqual({ width: 30, height: 6, gap: 6 });
  });

  it("leaves room for the dock below a sheet companion", () => {
    const position = companionHomePosition(
      display,
      {
        windowSize: 256,
        anchor: { bodyLeft: 100, bodyBottom: 38, margin: 4 },
      },
      COMPANION_DOCK_CLEARANCE,
    );

    // The sheet hangs left so the drawn body lands 4px inside the work area;
    // vertically, the same margin now applies to the bottom of the dock.
    expect(position).toEqual({ x: -96, y: 666 });
  });
});
