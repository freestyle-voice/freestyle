import { useCallback, useEffect, useState } from "react";
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
  const [balance, setBalance] = useState<CloudUsageBalance | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await getClient().api.usage.$get();
      if (!res.ok) return;
      const data = (await res.json()) as CloudUsageBalance;
      setBalance(data);
    } catch {
      /* ignore — best-effort */
    }
  }, []);

  useEffect(() => {
    if (!signedIn) {
      setBalance(null);
      return;
    }
    refresh();
  }, [signedIn, refresh]);

  // Refresh after each transcription completes.
  useEffect(() => {
    if (!signedIn) return;
    const remove = window.api?.onTranscriptionDone(() => {
      refresh();
    });
    return () => remove?.();
  }, [signedIn, refresh]);

  return balance;
}
