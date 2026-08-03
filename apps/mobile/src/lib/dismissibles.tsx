/**
 * Device-local dismissible state for in-app dialogs/banners (changelogs,
 * feature prompts, profile nudges). Persisted via the shared AsyncStorage pref
 * store as a JSON string array. Presence of a key means dismissed.
 *
 * Not cloud-synced — dismissals are per-device (same treatment as
 * `onboarding_complete`). Exposes a `ready` gate so consumers don't flash a
 * dialog before the stored list has hydrated.
 *
 * Keys must match {@link notificationKeySchema}; invalid / empty keys are
 * no-ops so a typo can't poison the store.
 */

import {
  type DismissibleNotificationState,
  notificationKeySchema,
} from "@freestyle-voice/validations";
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

function isValidKey(key: string): boolean {
  return notificationKeySchema.safeParse(key).success;
}

export function DismissiblesProvider({ children }: { children: ReactNode }) {
  const [keys, setKeys] = useState<Set<string>>(() => new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = await getJsonPref<string[]>(STORAGE_KEY, []);
        if (cancelled) return;
        setKeys(
          new Set(
            stored.filter(
              (k): k is string => typeof k === "string" && isValidKey(k),
            ),
          ),
        );
      } catch {
        // Storage can be unavailable; degrade to an empty in-memory store.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist after hydrate. Kept outside setState updaters so Strict Mode /
  // concurrent double-invokes can't write AsyncStorage for a discarded state.
  useEffect(() => {
    if (!ready) return;
    void setJsonPref(STORAGE_KEY, [...keys]).catch(() => {});
  }, [keys, ready]);

  const dismiss = useCallback(
    (key: string) => {
      // Consumers should already gate on `ready`; enforcing it here prevents
      // an early action from being overwritten by the hydration result.
      if (!ready) return;
      const parsed = notificationKeySchema.safeParse(key);
      if (!parsed.success) return;

      setKeys((prev) => {
        if (prev.has(parsed.data)) return prev;
        const next = new Set(prev);
        next.add(parsed.data);
        return next;
      });
    },
    [ready],
  );

  const reset = useCallback(
    (key: string) => {
      if (!ready) return;
      const parsed = notificationKeySchema.safeParse(key);
      if (!parsed.success) return;

      setKeys((prev) => {
        if (!prev.has(parsed.data)) return prev;
        const next = new Set(prev);
        next.delete(parsed.data);
        return next;
      });
    },
    [ready],
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
export function useDismissible(key: string): DismissibleNotificationState {
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
