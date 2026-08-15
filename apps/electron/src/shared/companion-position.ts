export interface CompanionDisplay {
  id: number;
  workArea: { x: number; y: number; width: number; height: number };
}

/**
 * The display to use when moving the companion for a dictation session.
 *
 * A focused-app display is authoritative: the mouse can be parked on another
 * monitor while the user dictates into a keyboard-focused app.
 */
export function resolveCompanionDisplay<T extends CompanionDisplay>(
  focusedDisplay: T | null,
  cursorDisplay: T,
): T {
  return focusedDisplay ?? cursorDisplay;
}

/**
 * Opening the panel establishes the shared display for the panel and its
 * companion, even if the companion was previously anchored for dictation.
 */
export function resolvePanelCompanionDisplays<T extends CompanionDisplay>(
  panelDisplay: T,
): { panelDisplay: T; companionDisplay: T } {
  return { panelDisplay, companionDisplay: panelDisplay };
}

export interface HotRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Whether a screen point falls in a hot rect placed at `origin`. */
export function pointInHotRect(
  point: Point,
  origin: Point,
  hot: HotRect,
): boolean {
  return (
    point.x >= origin.x + hot.x &&
    point.x <= origin.x + hot.x + hot.width &&
    point.y >= origin.y + hot.y &&
    point.y <= origin.y + hot.y + hot.height
  );
}

/**
 * The candidate whose companion home corner contains the cursor.
 *
 * The companion window occupies one display at a time, so a hit test against
 * its live bounds alone leaves every other monitor with no summon corner — the
 * companion can only be called from the screen it is already on. Giving every
 * display's home corner the same hot rect makes the gesture reachable from
 * whichever screen the user is actually working on.
 */
export function findHotCorner<T>(
  point: Point,
  hot: HotRect,
  candidates: Array<{ display: T; origin: Point }>,
): T | null {
  for (const candidate of candidates) {
    if (pointInHotRect(point, candidate.origin, hot)) return candidate.display;
  }
  return null;
}

/** Tracks the dictation session allowed to update the companion's display. */
export interface DictationDisplayRequestTracker {
  begin: () => number;
  isCurrent: (request: number) => boolean;
}

export function createDictationDisplayRequestTracker(): DictationDisplayRequestTracker {
  let current = 0;
  return {
    begin: () => ++current,
    isCurrent: (request) => request === current,
  };
}

/** Prevent an in-flight focused-window lookup from replacing a newer anchor. */
export function invalidateDictationDisplayRequest(
  tracker: DictationDisplayRequestTracker,
): void {
  tracker.begin();
}
