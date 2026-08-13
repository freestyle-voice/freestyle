import { describe, expect, test } from "vitest";
import {
  createDictationDisplayRequestTracker,
  invalidateDictationDisplayRequest,
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
