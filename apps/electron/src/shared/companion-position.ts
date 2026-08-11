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

/** Tracks the dictation session allowed to update the companion's display. */
export function createDictationDisplayRequestTracker(): {
  begin: () => number;
  isCurrent: (request: number) => boolean;
} {
  let current = 0;
  return {
    begin: () => ++current,
    isCurrent: (request) => request === current,
  };
}
