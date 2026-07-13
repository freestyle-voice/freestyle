import { useQuery } from "@tanstack/react-query";
import { getClient } from "./api";
import { ONE_HOUR } from "./query";

export interface CloudUsageBalance {
  remaining: number;
  limit: number;
  totalConsumed: number;
  resetsAt: string;
}

export interface UseCloudUsageResult {
  /** Latest fetched balance, or null when not signed in / fetch failed. */
  balance: CloudUsageBalance | null;
  /** Epoch ms of the last successful fetch, or null if never fetched. */
  updatedAt: number | null;
  /** True while a (re)fetch is in flight. */
  isFetching: boolean;
  /** Force an immediate refetch of the balance. */
  refresh: () => void;
}

/** Percentage of credits consumed (0–100), safe against limit=0. */
export function usagePercent(balance: CloudUsageBalance): number {
  if (balance.limit === 0) return 0;
  return Math.round(
    ((balance.limit - balance.remaining) / balance.limit) * 100,
  );
}

/**
 * Fetches cloud usage balance. Cached for an hour (staleTime) — no longer
 * refetches after every transcription; consumers surface a manual refresh
 * control instead. Returns null when not signed in or if the fetch fails
 * (best-effort).
 */
export function useCloudUsage(signedIn: boolean): UseCloudUsageResult {
  const query = useQuery({
    queryKey: ["cloud-usage"],
    queryFn: async () => {
      const res = await getClient().api.usage.$get();
      if (!res.ok) return null;
      return (await res.json()) as CloudUsageBalance;
    },
    enabled: signedIn,
    staleTime: ONE_HOUR,
    // Best-effort — don't retry aggressively.
    retry: 1,
  });

  return {
    balance: signedIn ? (query.data ?? null) : null,
    updatedAt: query.dataUpdatedAt || null,
    isFetching: query.isFetching,
    refresh: () => void query.refetch(),
  };
}
