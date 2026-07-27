/**
 * Freestyle Cloud subscription (Pro) actions for mobile. Uses the
 * `@better-auth/stripe` client plugin's Checkout/Portal flows, opened in an
 * in-app browser and returned via the `freestyle://` scheme. This is the beta
 * web-checkout path (Option A) — native IAP is not implemented.
 */

import * as WebBrowser from "expo-web-browser";

import { authClient } from "./auth-client";

const RETURN_URL = "freestyle://billing";

export interface UpgradeResult {
  /** True if the browser closed via our return deep-link (user likely finished). */
  returned: boolean;
}

/** Open Stripe Checkout for Pro. `annual` toggles the annual price. */
export async function startProCheckout(
  annual: boolean,
): Promise<UpgradeResult> {
  const { data, error } = await authClient.subscription.upgrade({
    plan: "pro",
    annual,
    successUrl: RETURN_URL,
    cancelUrl: RETURN_URL,
  });
  if (error || !data?.url) {
    throw new Error(error?.message ?? "Could not start checkout.");
  }
  const result = await WebBrowser.openAuthSessionAsync(data.url, RETURN_URL);
  return { returned: result.type === "success" };
}

/** Open the Stripe Billing Portal to manage/cancel an existing subscription. */
export async function openBillingPortal(): Promise<void> {
  const { data, error } = await authClient.subscription.billingPortal({
    returnUrl: RETURN_URL,
  });
  if (error || !data?.url) {
    throw new Error(error?.message ?? "Could not open billing portal.");
  }
  await WebBrowser.openAuthSessionAsync(data.url, RETURN_URL);
}
