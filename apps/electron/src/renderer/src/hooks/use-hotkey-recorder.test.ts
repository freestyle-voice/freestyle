import { describe, expect, it } from "vitest";
import {
  type HotkeyCombo,
  latchFromCapturedCombo,
  nextRightModifierLatch,
} from "./use-hotkey-recorder";

const EMPTY: HotkeyCombo = { modifiers: [], key: null };

describe("latchFromCapturedCombo", () => {
  it("latches a solo right-side modifier", () => {
    expect(latchFromCapturedCombo({ modifiers: [], key: "RightAlt" })).toBe(
      "RightAlt",
    );
    expect(latchFromCapturedCombo({ modifiers: [], key: "RightControl" })).toBe(
      "RightControl",
    );
  });

  it("does not latch a right-side modifier held as part of a chord", () => {
    expect(
      latchFromCapturedCombo({ modifiers: ["Control"], key: "RightAlt" }),
    ).toBeNull();
  });

  it("clears the latch for ordinary keys", () => {
    expect(latchFromCapturedCombo({ modifiers: [], key: "Space" })).toBeNull();
    expect(latchFromCapturedCombo({ modifiers: ["Alt"], key: "U" })).toBeNull();
  });
});

// On Windows the native binary reports Right Alt as RECORD_KEY:RightAlt while
// the focused settings window independently sees a DOM AltRight keydown. The
// two arrive in either order, so the latch must survive both interleavings —
// otherwise the hotkey saves as generic "Alt" and both Alt keys trigger it.
describe("Right Alt capture on Windows (native + DOM race)", () => {
  it("latches RightAlt when the DOM event lands first", () => {
    let latch = nextRightModifierLatch(null, EMPTY, {
      rightToken: "RightAlt",
      modifierCount: 1,
      genericModifiers: ["Alt"],
      explicitLeft: false,
    });
    expect(latch).toBe("RightAlt");

    latch = latchFromCapturedCombo({ modifiers: [], key: "RightAlt" });
    expect(latch).toBe("RightAlt");
  });

  it("latches RightAlt when the native capture lands first", () => {
    let latch = latchFromCapturedCombo({ modifiers: [], key: "RightAlt" });
    expect(latch).toBe("RightAlt");

    // Draft already carries the collapsed generic modifier by now.
    latch = nextRightModifierLatch(
      latch,
      { modifiers: ["Alt"], key: null },
      {
        rightToken: "RightAlt",
        modifierCount: 1,
        genericModifiers: ["Alt"],
        explicitLeft: false,
      },
    );
    expect(latch).toBe("RightAlt");
  });

  it("leaves left Alt unlatched so it saves as generic Alt", () => {
    const latch = nextRightModifierLatch(null, EMPTY, {
      rightToken: null,
      modifierCount: 1,
      genericModifiers: ["Alt"],
      explicitLeft: true,
    });
    expect(latch).toBeNull();
  });
});
