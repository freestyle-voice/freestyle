import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { getClient } from "./api";

export interface CloudUsageBalance {
  remaining: number;
  limit: number;
  totalConsumed: number;
  resetsAt: string;
}

/** Percentage of credits consumed (0–100), safe against limit=0. */
export function usagePercent(balance: CloudUsageBalance): number {
  if (balance.limit === 0) return 0;
  return Math.round(
    ((balance.limit - balance.remaining) / balance.limit) * 100,
  );
}

/**
 * Fetches cloud usage balance. Refreshes on mount and after each transcription.
 * Returns null when not signed in or if the fetch fails (best-effort).
 */
export function useCloudUsage(signedIn: boolean): CloudUsageBalance | null {
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ["cloud-usage"],
    queryFn: async () => {
      const res = await getClient().api.usage.$get();
      if (!res.ok) return null;
      return (await res.json()) as CloudUsageBalance;
    },
    enabled: signedIn,
    // Best-effort — don't retry aggressively.
    retry: 1,
  });

  // Refresh after each transcription completes.
  useEffect(() => {
    if (!signedIn) return;
    const remove = window.api?.onTranscriptionDone(() => {
      void queryClient.invalidateQueries({ queryKey: ["cloud-usage"] });
    });
    return () => remove?.();
  }, [signedIn, queryClient]);

  return signedIn ? (data ?? null) : null;
}
