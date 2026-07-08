import { QueryClient } from "@tanstack/react-query";
import { getClient } from "./api";

/** Common staleTime for cached queries (1 hour). */
export const ONE_HOUR = 60 * 60 * 1000;

/**
 * Shared query key for the full settings map (`GET /api/settings`). Every
 * consumer must use this exact key so React Query dedupes their fetches into a
 * single cached request — a stray key string would silently split the cache.
 */
export const SETTINGS_QUERY_KEY = ["settings-all"] as const;

/**
 * Query options for the full persisted-settings map. Use with `useQuery`:
 *
 *   const { data } = useQuery(settingsQueryOptions());
 *   const { data } = useQuery({ ...settingsQueryOptions(), enabled });
 *
 * Keeps the key + fetch shape in one place across the pages that read settings
 * (settings, tone, models, onboarding, tutorial demo).
 */
export function settingsQueryOptions() {
  return {
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: async (): Promise<Record<string, string>> => {
      const res = await getClient().api.settings.$get();
      if (!res.ok) throw new Error("Failed to load settings");
      return (await res.json()) as Record<string, string>;
    },
  };
}

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
