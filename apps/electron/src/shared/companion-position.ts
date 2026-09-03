import type { CompanionFacing } from "./companion";

export interface CompanionDisplay {
  id: number;
  workArea: { x: number; y: number; width: number; height: number };
}

export interface CompanionWindowSize {
  width: number;
  height: number;
}

export interface CompanionHomeSprite {
  windowSize: number;
  anchor: {
    bodyLeft: number;
    bodyBottom: number;
    margin: number;
  } | null;
}

export type CompanionDisplayPositions = Record<
  string,
  { x: number; y: number }
>;

/**
 * The default corner home for a companion. Sheet sprites are positioned by
 * their drawn body rather than their transparent canvas; their dock needs its
 * own clearance below that body to remain on-screen.
 */
export function companionHomePosition<T extends CompanionDisplay>(
  display: T,
  sprite: CompanionHomeSprite,
  dockClearance = 0,
): { x: number; y: number } {
  const { x, y, height } = display.workArea;
  if (!sprite.anchor) {
    return { x, y: y + height - sprite.windowSize };
  }
  return {
    x: x + sprite.anchor.margin - sprite.anchor.bodyLeft,
    y:
      y +
      height -
      sprite.windowSize +
      sprite.anchor.bodyBottom -
      sprite.anchor.margin -
      dockClearance,
  };
}

/**
 * The companion faces into the display: right from the left half, left from
 * the right half. Bounds are used rather than the cursor so a parked cursor
 * never changes the companion's pose.
 */
export function companionFacingForBounds<T extends CompanionDisplay>(
  bounds: { x: number; width: number },
  display: T,
): CompanionFacing {
  const companionCenter = bounds.x + bounds.width / 2;
  const displayCenter = display.workArea.x + display.workArea.width / 2;
  return companionCenter >= displayCenter ? "left" : "right";
}

/** Keep a manually placed companion wholly reachable on its display. */
export function clampCompanionPosition<T extends CompanionDisplay>(
  position: { x: number; y: number },
  display: T,
  size: CompanionWindowSize,
): { x: number; y: number } {
  const { x, y, width, height } = display.workArea;
  return {
    x: Math.min(Math.max(position.x, x), x + Math.max(0, width - size.width)),
    y: Math.min(Math.max(position.y, y), y + Math.max(0, height - size.height)),
  };
}

/**
 * A companion remembers a manually placed slot per display. A screen without
 * a saved slot deliberately falls back to the caller's bottom-left home.
 */
export function positionForCompanionDisplay<T extends CompanionDisplay>(
  display: T,
  size: CompanionWindowSize,
  positions: CompanionDisplayPositions,
  fallback: { x: number; y: number },
): { x: number; y: number } {
  const saved = positions[String(display.id)];
  return saved ? clampCompanionPosition(saved, display, size) : fallback;
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
 * Dictation keeps the visible panel alongside the companion on the target
 * display, while leaving a hidden panel alone.
 */
export function resolveDictationWindowDisplays<T extends CompanionDisplay>(
  dictationDisplay: T,
  panelVisible: boolean,
): { panelDisplay: T | null; companionDisplay: T } {
  return {
    panelDisplay: panelVisible ? dictationDisplay : null,
    companionDisplay: dictationDisplay,
  };
}

/** The current dictation target wins over a parked cursor when opening a panel. */
export function resolveDictationPanelDisplay<T extends CompanionDisplay>(
  dictationDisplay: T | null,
  cursorDisplay: T,
): T {
  return dictationDisplay ?? cursorDisplay;
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
