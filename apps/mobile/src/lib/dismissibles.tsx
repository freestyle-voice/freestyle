/**
 * Device-local dismissible state for in-app dialogs/banners (changelogs,
 * feature prompts, profile nudges). Persisted via the shared AsyncStorage pref
 * store as a JSON string array. Presence of a key means dismissed.
 *
 * Not cloud-synced — dismissals are per-device (same treatment as
 * `onboarding_complete`). Exposes a `ready` gate so consumers don't flash a
 * dialog before the stored list has hydrated.
 */

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { getJsonPref, setJsonPref } from "./storage";

const STORAGE_KEY = "dismissed_notifications";

interface DismissiblesContextValue {
  ready: boolean;
  dismissedKeys: ReadonlySet<string>;
  dismiss: (key: string) => void;
  reset: (key: string) => void;
}

const DismissiblesContext = createContext<DismissiblesContextValue | null>(
  null,
);

export function DismissiblesProvider({ children }: { children: ReactNode }) {
  const [keys, setKeys] = useState<Set<string>>(() => new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const stored = await getJsonPref<string[]>(STORAGE_KEY, []);
      setKeys(
        new Set(stored.filter((k) => typeof k === "string" && k.length > 0)),
      );
      setReady(true);
    })();
  }, []);

  const persist = useCallback((next: Set<string>) => {
    void setJsonPref(STORAGE_KEY, [...next]);
  }, []);

  const dismiss = useCallback(
    (key: string) => {
      setKeys((prev) => {
        if (prev.has(key)) return prev;
        const next = new Set(prev);
        next.add(key);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const reset = useCallback(
    (key: string) => {
      setKeys((prev) => {
        if (!prev.has(key)) return prev;
        const next = new Set(prev);
        next.delete(key);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const value = useMemo(
    () => ({ ready, dismissedKeys: keys, dismiss, reset }),
    [ready, keys, dismiss, reset],
  );

  return (
    <DismissiblesContext.Provider value={value}>
      {children}
    </DismissiblesContext.Provider>
  );
}

export interface UseDismissibleResult {
  /** True once AsyncStorage has hydrated. */
  ready: boolean;
  /** Whether this key has been dismissed on this device. */
  dismissed: boolean;
  /** Permanently dismiss — records the key so the UI won't show again. */
  dismiss: () => void;
  /** Undo a dismissal — removes the key so the UI can show again. */
  reset: () => void;
}

/**
 * Per-key view over the shared dismissibles store.
 *
 * @example
 * ```tsx
 * const { dismissed, dismiss, ready } = useDismissible("profile_info_prompt");
 * if (!ready || dismissed) return null;
 * return <Banner onClose={dismiss} />;
 * ```
 */
export function useDismissible(key: string): UseDismissibleResult {
  const ctx = useContext(DismissiblesContext);
  if (!ctx) {
    throw new Error(
      "useDismissible must be used within a DismissiblesProvider",
    );
  }

  const { ready, dismissedKeys, dismiss: dismissKey, reset: resetKey } = ctx;

  const dismiss = useCallback(() => dismissKey(key), [dismissKey, key]);
  const reset = useCallback(() => resetKey(key), [resetKey, key]);

  return {
    ready,
    dismissed: dismissedKeys.has(key),
    dismiss,
    reset,
  };
}
