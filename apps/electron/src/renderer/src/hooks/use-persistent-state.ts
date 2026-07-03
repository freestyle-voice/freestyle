import { useCallback, useState } from "react";

/**
 * A `useState` variant that persists a string-union value in `localStorage`, so
 * UI-only preferences (like the active tab of a page) survive navigation and app
 * restarts. Reads are validated against `isValid` so a stale/invalid stored
 * value can never put the UI into an impossible state — it falls back instead.
 *
 * localStorage access is wrapped in try/catch: a private-mode or quota failure
 * degrades gracefully to plain in-memory state rather than crashing the render.
 */
export function usePersistentState<T extends string>(
  key: string,
  fallback: T,
  isValid: (value: string) => value is T,
): [T, (value: T) => void] {
  const [state, setState] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored !== null && isValid(stored)) return stored;
    } catch {
      // localStorage unavailable — fall back to the default silently.
    }
    return fallback;
  });

  const set = useCallback(
    (value: T) => {
      setState(value);
      try {
        localStorage.setItem(key, value);
      } catch {
        // Ignore write failures (private mode, quota) — state still updates.
      }
    },
    [key],
  );

  return [state, set];
}
