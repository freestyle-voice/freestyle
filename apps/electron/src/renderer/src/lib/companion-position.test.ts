import { describe, expect, test } from "vitest";
import {
  createDictationDisplayRequestTracker,
  findHotCorner,
  invalidateDictationDisplayRequest,
  pointInHotRect,
  resolveCompanionDisplay,
  resolvePanelCompanionDisplays,
} from "../../../shared/companion-position";

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

test("keeps the companion on the display selected when opening the panel", () => {
  expect(resolvePanelCompanionDisplays(cursorDisplay)).toEqual({
    panelDisplay: cursorDisplay,
    companionDisplay: cursorDisplay,
  });
});

test("ignores a focused-display result from an earlier dictation session", () => {
  const tracker = createDictationDisplayRequestTracker();
  const firstSession = tracker.begin();
  const secondSession = tracker.begin();

  expect(tracker.isCurrent(firstSession)).toBe(false);
  expect(tracker.isCurrent(secondSession)).toBe(true);
});

test("rejects a pending focused-display result after the panel takes ownership", () => {
  const tracker = createDictationDisplayRequestTracker();
  const request = tracker.begin();
  invalidateDictationDisplayRequest(tracker);

  expect(tracker.isCurrent(request)).toBe(false);
});

describe("hot corner", () => {
  const hot = { x: 8, y: 200, width: 48, height: 48 };
  // Two side-by-side displays; the companion's home corner sits at the
  // bottom-left of each work area.
  const left = { display: "left", origin: { x: 0, y: 861 } };
  const right = { display: "right", origin: { x: 1728, y: 861 } };
  const corners = [left, right];

  test("matches a point inside the rect placed at the origin", () => {
    expect(pointInHotRect({ x: 20, y: 1080 }, left.origin, hot)).toBe(true);
  });

  test("rejects a point outside the rect", () => {
    expect(pointInHotRect({ x: 400, y: 1080 }, left.origin, hot)).toBe(false);
  });

  test("finds the corner of the display the cursor is actually on", () => {
    expect(findHotCorner({ x: 1748, y: 1080 }, hot, corners)).toBe("right");
    expect(findHotCorner({ x: 20, y: 1080 }, hot, corners)).toBe("left");
  });

  test("returns null when the cursor is in no corner", () => {
    expect(findHotCorner({ x: 900, y: 400 }, hot, corners)).toBeNull();
  });
});
