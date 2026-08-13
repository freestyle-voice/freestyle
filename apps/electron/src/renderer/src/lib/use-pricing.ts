import { useQuery } from "@tanstack/react-query";
import { getClient } from "./api";
import { ONE_HOUR, queryKeys } from "./query";

/**
 * Currency-aware Pro pricing from Freestyle Cloud's public `GET /v2/pricing`
 * (proxied through the local `GET /api/pricing`). Mirrors the cloud response
 * shape used by the marketing site.
 */
export interface CloudPricing {
  currency: "usd" | "inr";
  monthly: {
    /** Amount in the currency's smallest unit (e.g. cents / paise). */
    amount: number;
    /** Pre-formatted display string, e.g. "$12" or "₹999". */
    display: string;
  };
  /** Pro annual plan, expressed as the effective per-month price. */
  annual: {
    amount: number;
    display: string;
  };
}

/**
 * USD fallback used as `placeholderData` so the pricing UI never flashes
 * empty prices while the geo-aware cloud response loads (or if it fails —
 * the local `/api/pricing` route also returns this same shape on upstream
 * errors).
 */
export const FALLBACK_PRICING: CloudPricing = {
  currency: "usd",
  monthly: { amount: 1200, display: "$12" },
  annual: { amount: 900, display: "$9" },
};

/**
 * Geo-aware Pro pricing from Freestyle Cloud (via the local server
 * passthrough at `GET /api/pricing`). Currency is INR for India, USD
 * otherwise. Cached for an hour; always returns a usable payload thanks to
 * the USD placeholder / server-side fallback.
 */
export function usePricing(): CloudPricing {
  const { data } = useQuery({
    queryKey: queryKeys.cloud.pricing,
    staleTime: ONE_HOUR,
    retry: 1,
    placeholderData: FALLBACK_PRICING,
    queryFn: async (): Promise<CloudPricing> => {
      const res = await getClient().api.pricing.$get();
      if (!res.ok) throw new Error(`Failed to fetch pricing (${res.status})`);
      return (await res.json()) as CloudPricing;
    },
  });
  return data ?? FALLBACK_PRICING;
}
