export interface DictationDisplay {
  id: number;
  workArea: { x: number; y: number; width: number; height: number };
}

/** The current dictation target wins over a parked cursor when opening a panel. */
export function resolveDictationPanelDisplay<T extends DictationDisplay>(
  dictationDisplay: T | null,
  cursorDisplay: T,
): T {
  return dictationDisplay ?? cursorDisplay;
}

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
