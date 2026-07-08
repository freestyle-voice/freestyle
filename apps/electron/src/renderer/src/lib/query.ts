import { QueryClient } from "@tanstack/react-query";

/** Common staleTime for cached queries (1 hour). */
export const ONE_HOUR = 60 * 60 * 1000;

/**
 * Shared QueryClient factory for the renderer. Defaults suit a desktop SPA:
 * - `refetchOnWindowFocus: false` — the user switches apps constantly; focus
 *   refetches would be noisy. Freshness is driven by explicit invalidation
 *   (mutations + IPC events) instead.
 * - `staleTime: ONE_HOUR` — avoid redundant refetches on remount/navigation.
 *   Queries that need fresher data override this locally.
 * - `retry: 1` — one retry for transient loopback hiccups, no aggressive loop.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: false,
        staleTime: ONE_HOUR,
        retry: 1,
      },
    },
  });
}
