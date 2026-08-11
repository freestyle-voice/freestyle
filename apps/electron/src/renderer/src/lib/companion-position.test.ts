import { describe, expect, test } from "vitest";
import { resolveCompanionDisplay } from "../../../shared/companion-position";

const focusedDisplay = {
  id: 2,
  workArea: { x: -1080, y: -1050, width: 1080, height: 1890 },
};
const cursorDisplay = {
  id: 1,
  workArea: { x: 0, y: 0, width: 1728, height: 1117 },
};

describe("resolveCompanionDisplay", () => {
  test("keeps a dictation session on the focused app's display when the cursor is elsewhere", () => {
    expect(resolveCompanionDisplay(focusedDisplay, cursorDisplay)).toBe(
      focusedDisplay,
    );
  });

  test("uses the cursor display only when no focused-app display is available", () => {
    expect(resolveCompanionDisplay(null, cursorDisplay)).toBe(cursorDisplay);
  });
});
