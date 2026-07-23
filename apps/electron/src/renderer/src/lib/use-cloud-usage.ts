import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { getClient } from "./api";
import { ONE_HOUR } from "./query";

export interface CloudUsageBalance {
  remaining: number;
  limit: number;
  totalConsumed: number;
  resetsAt: string;
  /** Subscription plan; absent on older cloud versions (treated as "free"). */
  plan?: "free" | "pro";
  /** True when the plan has no word limit (Pro). */
  unlimited?: boolean;
}

export type BillingPeriod = "monthly" | "annual";

/**
 * Lifecycle of a Stripe Checkout launched from the app:
 * - "launching": creating the checkout session / opening the browser.
 * - "pending": browser opened; polling usage until the plan flips to "pro"
 *   (or the poll window expires, which quietly returns to "idle").
 * - "success": the cloud reports plan === "pro" — the upgrade landed.
 * - "error": the checkout session couldn't be created/opened.
 */
export type CheckoutStatus =
  | "idle"
  | "launching"
  | "pending"
  | "success"
  | "error";

/** Poll cadence while waiting for a checkout to complete. */
const CHECKOUT_POLL_INTERVAL_MS = 5_000;
/** Give up waiting for payment after 10 minutes. */
const CHECKOUT_POLL_WINDOW_MS = 10 * 60 * 1000;

export interface UseCloudUsageResult {
  /** Latest fetched balance, or null when not signed in / fetch failed. */
  balance: CloudUsageBalance | null;
  /** Effective plan — "free" until the cloud says otherwise. */
  plan: "free" | "pro";
  /** True when the user is on Pro (unlimited dictation). */
  isPro: boolean;
  /** Epoch ms of the last successful fetch, or null if never fetched. */
  updatedAt: number | null;
  /** True while a (re)fetch is in flight. */
  isFetching: boolean;
  /** Force an immediate refetch of the balance. */
  refresh: () => void;
  /**
   * Create a Stripe Checkout session and open it in the system browser, then
   * poll usage until the plan flips to "pro" (see {@link CheckoutStatus}).
   */
  startCheckout: (period: BillingPeriod) => Promise<void>;
  /** Where the launched checkout currently stands. */
  checkoutStatus: CheckoutStatus;
  /** Human-readable reason when checkoutStatus === "error". */
  checkoutError: string | null;
  /** Return checkout state to "idle" (e.g. after showing the success view). */
  resetCheckout: () => void;
  /** Open the Stripe Billing Portal (manage/cancel) in the system browser. */
  openBillingPortal: () => Promise<boolean>;
  /** True while the billing-portal session is being created/opened. */
  portalOpening: boolean;
}

/** Percentage of credits consumed (0–100), safe against limit=0. */
export function usagePercent(balance: CloudUsageBalance): number {
  if (balance.unlimited || balance.limit === 0) return 0;
  return Math.round(
    ((balance.limit - balance.remaining) / balance.limit) * 100,
  );
}

export function useCloudUsage(signedIn: boolean): UseCloudUsageResult {
  const [checkoutStatus, setCheckoutStatus] = useState<CheckoutStatus>("idle");
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [portalOpening, setPortalOpening] = useState(false);
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["cloud-usage"],
    queryFn: async () => {
      const res = await getClient().api.usage.$get();
      if (!res.ok) return null;
      return (await res.json()) as CloudUsageBalance;
    },
    enabled: signedIn,
    staleTime: ONE_HOUR,
    // While a checkout is pending, poll so the UI notices the plan flip.
    refetchInterval:
      checkoutStatus === "pending" ? CHECKOUT_POLL_INTERVAL_MS : false,
    // Best-effort — don't retry aggressively.
    retry: 1,
  });

  useEffect(() => {
    if (!signedIn) return;
    const remove = window.api?.onTranscriptionDone(() => {
      void queryClient.invalidateQueries({ queryKey: ["cloud-usage"] });
    });
    return () => remove?.();
  }, [signedIn, queryClient]);

  const balance = signedIn ? (query.data ?? null) : null;
  const plan: "free" | "pro" = balance?.plan === "pro" ? "pro" : "free";
  const isPro = plan === "pro" || balance?.unlimited === true;

  useEffect(() => {
    if (checkoutStatus === "pending" && isPro) {
      setCheckoutStatus("success");
    }
  }, [checkoutStatus, isPro]);

  useEffect(() => {
    if (checkoutStatus !== "pending") return;
    const timer = setTimeout(() => {
      setCheckoutStatus((s) => (s === "pending" ? "idle" : s));
    }, CHECKOUT_POLL_WINDOW_MS);
    return () => clearTimeout(timer);
  }, [checkoutStatus]);

  const startCheckout = useCallback(
    async (period: BillingPeriod): Promise<void> => {
      setCheckoutStatus("launching");
      setCheckoutError(null);
      try {
        const res = await getClient().api.billing.checkout.$post({
          json: { period },
        });
        if (!res.ok) {
          throw new Error(
            res.status === 401
              ? "Sign in to Freestyle Cloud first"
              : `Could not start checkout (${res.status})`,
          );
        }
        const { url } = (await res.json()) as { url: string };
        const opened = await window.api.openExternal(url);
        if (!opened) throw new Error("Could not open the browser");
        setCheckoutStatus("pending");
      } catch (err) {
        setCheckoutError(
          err instanceof Error ? err.message : "Could not start checkout",
        );
        setCheckoutStatus("error");
      }
    },
    [],
  );

  const resetCheckout = useCallback((): void => {
    setCheckoutStatus("idle");
    setCheckoutError(null);
  }, []);

  const openBillingPortal = useCallback(async (): Promise<boolean> => {
    setPortalOpening(true);
    try {
      const res = await getClient().api.billing.portal.$post();
      if (!res.ok) return false;
      const { url } = (await res.json()) as { url: string };
      return await window.api.openExternal(url);
    } catch {
      return false;
    } finally {
      setPortalOpening(false);
    }
  }, []);

  return {
    balance,
    plan,
    isPro,
    updatedAt: query.dataUpdatedAt || null,
    isFetching: query.isFetching,
    refresh: () => void query.refetch(),
    startCheckout,
    checkoutStatus,
    checkoutError,
    resetCheckout,
    openBillingPortal,
    portalOpening,
  };
}
