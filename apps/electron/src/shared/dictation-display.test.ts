import { describe, expect, it } from "vitest";
import {
  createDictationDisplayRequestTracker,
  invalidateDictationDisplayRequest,
  resolveDictationPanelDisplay,
} from "./dictation-display";

const focusedDisplay = {
  id: 2,
  workArea: { x: -1080, y: -1050, width: 1080, height: 1890 },
};
const cursorDisplay = {
  id: 1,
  workArea: { x: 0, y: 0, width: 1728, height: 1117 },
};

describe("dictation display selection", () => {
  it("opens the panel on the active dictation display", () => {
    expect(resolveDictationPanelDisplay(focusedDisplay, cursorDisplay)).toBe(
      focusedDisplay,
    );
  });

  it("uses the cursor display when no dictation display is active", () => {
    expect(resolveDictationPanelDisplay(null, cursorDisplay)).toBe(
      cursorDisplay,
    );
  });

  it("ignores focused-display results from superseded dictation sessions", () => {
    const tracker = createDictationDisplayRequestTracker();
    const firstSession = tracker.begin();
    const secondSession = tracker.begin();

    expect(tracker.isCurrent(firstSession)).toBe(false);
    expect(tracker.isCurrent(secondSession)).toBe(true);
  });

  it("rejects a pending focused-display result after the panel takes ownership", () => {
    const tracker = createDictationDisplayRequestTracker();
    const request = tracker.begin();
    invalidateDictationDisplayRequest(tracker);

    expect(tracker.isCurrent(request)).toBe(false);
  });
});
