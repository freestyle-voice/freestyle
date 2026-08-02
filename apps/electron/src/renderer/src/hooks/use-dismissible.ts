import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { getClient } from "../lib/api";
import {
  DISMISSED_NOTIFICATIONS_QUERY_KEY,
  dismissedNotificationsQueryOptions,
} from "../lib/query";

export interface UseDismissibleResult {
  /** True once the dismissed-keys list has loaded (or failed). */
  ready: boolean;
  /** Whether this key has been dismissed on this device. */
  dismissed: boolean;
  /** Permanently dismiss — records the key so the UI won't show again. */
  dismiss: () => void;
  /** Undo a dismissal — removes the key so the UI can show again. */
  reset: () => void;
}

/**
 * Device-local dismissible state for in-app dialogs/banners (changelogs,
 * feature prompts, profile nudges). Backed by `GET/PUT/DELETE
 * /api/dismissed-notifications` via a shared React Query cache so every
 * consumer of the same (or different) key shares one fetch.
 *
 * Presence of `key` in the list means dismissed. Writes are optimistic and
 * fire-and-forget — a failed PUT/DELETE leaves the optimistic UI state in
 * place until the next refetch.
 *
 * @example
 * ```tsx
 * const { dismissed, dismiss, ready } = useDismissible("profile_info_prompt");
 * if (!ready || dismissed) return null;
 * return <Banner onClose={dismiss} />;
 * ```
 */
export function useDismissible(key: string): UseDismissibleResult {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery(dismissedNotificationsQueryOptions());

  const dismissed = (data ?? []).includes(key);
  const ready = !isLoading;

  const dismiss = useCallback(() => {
    queryClient.setQueryData<string[]>(
      DISMISSED_NOTIFICATIONS_QUERY_KEY,
      (prev) => (prev?.includes(key) ? prev : [...(prev ?? []), key]),
    );
    getClient()
      .api["dismissed-notifications"][":key"].$put({
        param: { key },
      })
      .catch(() => {});
  }, [key, queryClient]);

  const reset = useCallback(() => {
    queryClient.setQueryData<string[]>(
      DISMISSED_NOTIFICATIONS_QUERY_KEY,
      (prev) => (prev ?? []).filter((k) => k !== key),
    );
    getClient()
      .api["dismissed-notifications"][":key"].$delete({
        param: { key },
      })
      .catch(() => {});
  }, [key, queryClient]);

  return { ready, dismissed, dismiss, reset };
}
