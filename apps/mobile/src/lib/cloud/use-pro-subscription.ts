/**
 * Native In-App Purchase flow for Freestyle Pro (StoreKit 2 / Play Billing).
 *
 * Apple mandates In-App Purchase for digital subscriptions, so mobile Pro can't
 * use the web Stripe checkout the desktop uses. This hook wraps `expo-iap`'s
 * `useIAP` to fetch the Pro subscription products, run the purchase/restore
 * flow, forward the signed transaction to Freestyle Cloud for server-side
 * validation (see `iap-verify.ts`), and refresh the cached usage/plan so the UI
 * reflects Pro immediately.
 *
 * Trust model: the store's local purchase result is NEVER trusted to grant Pro.
 * The cloud validates the receipt with Apple/Google and owns the `unlimited`
 * entitlement; the client only unlocks after {@link verifyIapPurchase} confirms.
 * The StoreKit transaction is finished only after that verification, so an
 * unverified purchase is redelivered on next launch instead of being lost.
 */

import { useQueryClient } from "@tanstack/react-query";
import {
  deepLinkToSubscriptions,
  ErrorCode,
  type Purchase,
  useIAP,
} from "expo-iap";
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";

import { proMonthlyProductId, proProductIds } from "./config";
import { verifyIapPurchase } from "./iap-verify";

export type PurchasePhase =
  | "idle"
  | "purchasing" // store sheet up / awaiting the transaction
  | "verifying" // sending the receipt to the cloud
  | "restoring";

export interface ProSubscriptionResult {
  /** IAP service is connected and products are loadable. */
  connected: boolean;
  /** Pro subscription products from the store, monthly first. */
  products: ReturnType<typeof useIAP>["subscriptions"];
  phase: PurchasePhase;
  busy: boolean;
  /** Last user-facing error (store or verification), or null. */
  error: string | null;
  /** Buy a Pro subscription. Defaults to the monthly product. */
  purchase: (productId?: string) => Promise<void>;
  /** Restore a previous purchase (e.g. new device / reinstall). */
  restore: () => Promise<void>;
  /** Open the OS-native manage-subscription UI (App Store / Play). */
  manage: () => Promise<void>;
}

export function useProSubscription(
  enabled: boolean = true,
): ProSubscriptionResult {
  const queryClient = useQueryClient();
  const [phase, setPhase] = useState<PurchasePhase>("idle");
  const [error, setError] = useState<string | null>(null);
  // Tracks whether we're mid-flow so the purchase listener knows to verify.
  const activeRef = useRef(false);

  const refreshUsage = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["cloud-usage"] });
  }, [queryClient]);

  // `finishTransaction` is captured in the purchase-success callback via a ref
  // so the callback identity stays stable across renders and there's no TDZ on
  // the value returned by `useIAP` below.
  const finishTransactionRef = useRef<
    ReturnType<typeof useIAP>["finishTransaction"] | null
  >(null);

  // Verify a completed purchase server-side, then finish the transaction. Only
  // called from the store's success callback (StoreKit/Play guarantee delivery).
  const verifyAndFinish = useCallback(
    async (purchase: Purchase) => {
      const finish = finishTransactionRef.current;
      if (!finish) return;
      setPhase("verifying");
      try {
        const result = await verifyIapPurchase({
          platform: purchase.platform === "android" ? "android" : "ios",
          productId: purchase.productId,
          transactionToken: purchase.purchaseToken ?? "",
          transactionId: purchase.transactionId ?? undefined,
        });

        if (result.status === "verified") {
          // Only now do we consume the transaction — finishing before a
          // confirmed grant would drop the receipt on a transient failure.
          await finish({ purchase, isConsumable: false });
          refreshUsage();
          setError(null);
        } else if (result.status === "unavailable") {
          setError(
            "Purchases aren't available yet. Your purchase is safe — reopen the app once activation is live to restore it.",
          );
        } else {
          setError("We couldn't verify that purchase. Please contact support.");
        }
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Could not verify your purchase.",
        );
      } finally {
        activeRef.current = false;
        setPhase("idle");
      }
    },
    [refreshUsage],
  );

  const {
    connected,
    subscriptions,
    fetchProducts,
    requestPurchase,
    finishTransaction,
    getAvailablePurchases,
  } = useIAP({
    onPurchaseSuccess: (purchase) => {
      void verifyAndFinish(purchase);
    },
    onPurchaseError: (err) => {
      activeRef.current = false;
      setPhase("idle");
      // A user backing out of the sheet isn't an error worth surfacing.
      if (err.code === ErrorCode.UserCancelled) {
        setError(null);
        return;
      }
      setError(err.message || "The purchase could not be completed.");
    },
    onError: (err) => setError(err.message),
  });

  useEffect(() => {
    finishTransactionRef.current = finishTransaction;
  });

  // Load the Pro subscription products once connected.
  useEffect(() => {
    if (!enabled || !connected) return;
    void fetchProducts({ skus: proProductIds(), type: "subs" }).catch((e) =>
      setError(e instanceof Error ? e.message : "Could not load plans."),
    );
  }, [enabled, connected, fetchProducts]);

  const purchase = useCallback(
    async (productId: string = proMonthlyProductId()) => {
      if (activeRef.current) return;
      activeRef.current = true;
      setError(null);
      setPhase("purchasing");
      try {
        // The result is delivered through onPurchaseSuccess/onPurchaseError;
        // requestPurchase itself resolves once the sheet is presented.
        await requestPurchase({
          request: {
            apple: { sku: productId },
            google: { skus: [productId] },
          },
          type: "subs",
        });
      } catch (e) {
        activeRef.current = false;
        setPhase("idle");
        setError(
          e instanceof Error ? e.message : "The purchase could not start.",
        );
      }
    },
    [requestPurchase],
  );

  const restore = useCallback(async () => {
    setError(null);
    setPhase("restoring");
    try {
      await getAvailablePurchases();
      // Re-verify the latest Pro entitlement, then let the usage refetch decide.
      refreshUsage();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not restore purchases.");
    } finally {
      setPhase("idle");
    }
  }, [getAvailablePurchases, refreshUsage]);

  const manage = useCallback(async () => {
    try {
      await deepLinkToSubscriptions({
        skuAndroid:
          Platform.OS === "android" ? proMonthlyProductId() : undefined,
      });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Could not open subscription settings.",
      );
    }
  }, []);

  return {
    connected,
    products: subscriptions,
    phase,
    busy: phase !== "idle",
    error,
    purchase,
    restore,
    manage,
  };
}
