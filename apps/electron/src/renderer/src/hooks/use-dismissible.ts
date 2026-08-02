import { notificationKeySchema } from "@freestyle-voice/validations";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { getClient } from "../lib/api";
import {
  DISMISSED_NOTIFICATIONS_QUERY_KEY,
  dismissedNotificationsQueryOptions,
} from "../lib/query";

export interface UseDismissibleResult {
  /** True once the dismissed-keys list has loaded (or a prior cache exists). */
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
 * Presence of `key` in the list means dismissed. Writes are optimistic; a
 * non-OK response rolls the cache back (or invalidates if we have no
 * snapshot). Invalid / empty keys are no-ops.
 *
 * Storage follows the configured Freestyle server — the same SQLite DB as
 * settings/vocabulary. On a remote server that means dismissals are shared
 * across every renderer pointed at it (consistent with how settings work).
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
  const { data, isPending, isError } = useQuery(
    dismissedNotificationsQueryOptions(),
  );

  // Fail closed on a first-fetch error (no cached data): don't flash a
  // previously-dismissed banner while the loopback is unreachable.
  const dismissed =
    (data ?? []).includes(key) || (isError && data === undefined);
  // Ready once we have a definitive answer — success, cached data under
  // error, or a hard error we fail-closed on above.
  const ready = !isPending;

  const dismiss = useCallback(() => {
    const parsed = notificationKeySchema.safeParse(key);
    if (!parsed.success) return;

    const previous = queryClient.getQueryData<string[]>(
      DISMISSED_NOTIFICATIONS_QUERY_KEY,
    );
    queryClient.setQueryData<string[]>(
      DISMISSED_NOTIFICATIONS_QUERY_KEY,
      (prev) =>
        prev?.includes(parsed.data) ? prev : [...(prev ?? []), parsed.data],
    );

    void getClient()
      .api["dismissed-notifications"][":key"].$put({
        param: { key: parsed.data },
      })
      .then((res) => {
        if (res.ok) return;
        if (previous !== undefined) {
          queryClient.setQueryData(DISMISSED_NOTIFICATIONS_QUERY_KEY, previous);
        } else {
          void queryClient.invalidateQueries({
            queryKey: DISMISSED_NOTIFICATIONS_QUERY_KEY,
          });
        }
      })
      .catch(() => {
        if (previous !== undefined) {
          queryClient.setQueryData(DISMISSED_NOTIFICATIONS_QUERY_KEY, previous);
        } else {
          void queryClient.invalidateQueries({
            queryKey: DISMISSED_NOTIFICATIONS_QUERY_KEY,
          });
        }
      });
  }, [key, queryClient]);

  const reset = useCallback(() => {
    const parsed = notificationKeySchema.safeParse(key);
    if (!parsed.success) return;

    const previous = queryClient.getQueryData<string[]>(
      DISMISSED_NOTIFICATIONS_QUERY_KEY,
    );
    queryClient.setQueryData<string[]>(
      DISMISSED_NOTIFICATIONS_QUERY_KEY,
      (prev) => (prev ?? []).filter((k) => k !== parsed.data),
    );

    void getClient()
      .api["dismissed-notifications"][":key"].$delete({
        param: { key: parsed.data },
      })
      .then((res) => {
        if (res.ok) return;
        if (previous !== undefined) {
          queryClient.setQueryData(DISMISSED_NOTIFICATIONS_QUERY_KEY, previous);
        } else {
          void queryClient.invalidateQueries({
            queryKey: DISMISSED_NOTIFICATIONS_QUERY_KEY,
          });
        }
      })
      .catch(() => {
        if (previous !== undefined) {
          queryClient.setQueryData(DISMISSED_NOTIFICATIONS_QUERY_KEY, previous);
        } else {
          void queryClient.invalidateQueries({
            queryKey: DISMISSED_NOTIFICATIONS_QUERY_KEY,
          });
        }
      });
  }, [key, queryClient]);

  return { ready, dismissed, dismiss, reset };
}
