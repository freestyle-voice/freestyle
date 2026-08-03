import {
  type DismissibleNotificationState,
  notificationKeySchema,
} from "@freestyle-voice/validations";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { getClient } from "../lib/api";
import {
  DISMISSED_NOTIFICATIONS_QUERY_KEY,
  dismissedNotificationsQueryOptions,
} from "../lib/query";

type WriteResponse = { ok: boolean; status: number };

// Serialize writes per notification key across every hook instance. Without a
// queue, a rapid dismiss → reset can reach the server as DELETE → PUT and leave
// SQLite disagreeing with the latest optimistic UI state.
const writeQueues = new Map<string, Promise<void>>();
const writeGenerations = new Map<string, number>();

function beginWrite(key: string): number {
  const generation = (writeGenerations.get(key) ?? 0) + 1;
  writeGenerations.set(key, generation);
  return generation;
}

function enqueueWrite(
  key: string,
  generation: number,
  request: () => Promise<WriteResponse>,
  rollback: () => void,
): void {
  const previous = writeQueues.get(key) ?? Promise.resolve();
  const current = previous.then(async () => {
    try {
      const response = await request();
      if (!response.ok) throw new Error(`Write failed (${response.status})`);
    } catch {
      // A newer action owns the UI now and will run next in this same queue.
      // Only the latest operation may revert its optimistic change.
      if (writeGenerations.get(key) === generation) rollback();
    }
  });
  writeQueues.set(key, current);
  void current.finally(() => {
    if (writeQueues.get(key) !== current) return;
    writeQueues.delete(key);
    if (writeGenerations.get(key) === generation) {
      writeGenerations.delete(key);
    }
  });
}

/**
 * Device-local dismissible state for in-app dialogs/banners (changelogs,
 * feature prompts, profile nudges). Backed by `GET/PUT/DELETE
 * /api/dismissed-notifications` via a shared React Query cache so every
 * consumer of the same (or different) key shares one fetch.
 *
 * Presence of `key` in the list means dismissed. Writes are optimistic and
 * mutation-safe: an in-flight list fetch is cancelled first, and a failed
 * write reverts only its own key (never an unrelated concurrent mutation).
 * Invalid / empty keys are no-ops.
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
export function useDismissible(key: string): DismissibleNotificationState {
  const queryClient = useQueryClient();
  const { data } = useQuery(dismissedNotificationsQueryOptions());

  const dismissed = (data ?? []).includes(key);
  // An error without cached data is not a definitive answer. Consumers keep
  // their UI hidden until a successful fetch (or a prior cache) exists.
  const ready = data !== undefined;

  const dismiss = useCallback(() => {
    const parsed = notificationKeySchema.safeParse(key);
    if (!parsed.success) return;

    const generation = beginWrite(parsed.data);
    // Cancellation is initiated before the synchronous optimistic patch, so
    // the initial GET cannot overwrite it. `revert: false` keeps our patch
    // when cancellation settles.
    void queryClient.cancelQueries(
      { queryKey: DISMISSED_NOTIFICATIONS_QUERY_KEY },
      { revert: false },
    );
    const previous = queryClient.getQueryData<string[]>(
      DISMISSED_NOTIFICATIONS_QUERY_KEY,
    );
    const wasDismissed = previous?.includes(parsed.data) ?? false;
    queryClient.setQueryData<string[]>(
      DISMISSED_NOTIFICATIONS_QUERY_KEY,
      (current) =>
        current?.includes(parsed.data)
          ? current
          : [...(current ?? []), parsed.data],
    );

    enqueueWrite(
      parsed.data,
      generation,
      () =>
        getClient().api["dismissed-notifications"][":key"].$put({
          param: { key: parsed.data },
        }),
      () => {
        if (!wasDismissed) {
          queryClient.setQueryData<string[]>(
            DISMISSED_NOTIFICATIONS_QUERY_KEY,
            (current) => (current ?? []).filter((item) => item !== parsed.data),
          );
        }
      },
    );
  }, [key, queryClient]);

  const reset = useCallback(() => {
    const parsed = notificationKeySchema.safeParse(key);
    if (!parsed.success) return;

    const generation = beginWrite(parsed.data);
    void queryClient.cancelQueries(
      { queryKey: DISMISSED_NOTIFICATIONS_QUERY_KEY },
      { revert: false },
    );
    const previous = queryClient.getQueryData<string[]>(
      DISMISSED_NOTIFICATIONS_QUERY_KEY,
    );
    const wasDismissed = previous?.includes(parsed.data) ?? false;
    queryClient.setQueryData<string[]>(
      DISMISSED_NOTIFICATIONS_QUERY_KEY,
      (current) => (current ?? []).filter((item) => item !== parsed.data),
    );

    enqueueWrite(
      parsed.data,
      generation,
      () =>
        getClient().api["dismissed-notifications"][":key"].$delete({
          param: { key: parsed.data },
        }),
      () => {
        if (wasDismissed) {
          queryClient.setQueryData<string[]>(
            DISMISSED_NOTIFICATIONS_QUERY_KEY,
            (current) =>
              current?.includes(parsed.data)
                ? current
                : [...(current ?? []), parsed.data],
          );
        }
      },
    );
  }, [key, queryClient]);

  return { ready, dismissed, dismiss, reset };
}
