/**
 * Freestyle Cloud in-app-purchase receipt verification.
 *
 * Native IAP (StoreKit / Play Billing) collects the money and hands back a
 * signed transaction, but Apple/Google are the source of truth — the client
 * must NOT trust its own purchase result to grant Pro. Instead we forward the
 * signed transaction to Freestyle Cloud, which validates it against the store's
 * servers and flips the account's `unlimited` entitlement. The app then refetches
 * `/v1/usage` to reflect the new plan.
 *
 * ┌──────────── CONTRACT (implemented server-side in the cloud repo) ──────────┐
 * │ POST /v2/iap/verify                                                         │
 * │   Auth:  better-auth session cookie (same as /v1/usage)                     │
 * │   Body:  {                                                                  │
 * │     platform: "ios" | "android",                                            │
 * │     productId: string,           // the purchased subscription product id   │
 * │     // iOS (StoreKit 2): the JWS representation of the transaction, which    │
 * │     //   the cloud verifies with Apple's App Store Server API.              │
 * │     // Android (Play Billing): the purchase token, which the cloud verifies  │
 * │     //   with the Google Play Developer API.                                │
 * │     transactionToken: string,                                               │
 * │     transactionId?: string,                                                 │
 * │   }                                                                         │
 * │   200:  { ok: true, unlimited: boolean, plan: "free" | "pro" }              │
 * │   402:  { ok: false, reason: "invalid_receipt" }                            │
 * │   409:  { ok: false, reason: "already_linked_other_account" }               │
 * │                                                                             │
 * │ The server should also handle App Store Server Notifications v2 / Google    │
 * │ Real-time Developer Notifications webhooks to keep `unlimited` in sync on   │
 * │ renewal, cancellation, refund, and billing retry — the client verify call   │
 * │ only covers the initial (and restore) grant.                                │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Until that endpoint ships in the cloud repo, {@link verifyIapPurchase} returns
 * `{ status: "unavailable" }` on 404/501 instead of throwing, so the mobile UI
 * can surface an honest "not yet available" message rather than crashing.
 */

import { cloudUrl } from "./config";
import { authHeaders, CloudAuthError } from "./session";

export interface IapVerificationInput {
  platform: "ios" | "android";
  productId: string;
  /** iOS: StoreKit 2 JWS. Android: Play Billing purchase token. */
  transactionToken: string;
  transactionId?: string;
}

export type IapVerificationResult =
  | { status: "verified"; unlimited: boolean; plan: "free" | "pro" }
  | { status: "invalid" }
  | { status: "unavailable" };

/**
 * Send a completed native purchase to the cloud for server-side validation and
 * entitlement grant. Never trust the local purchase alone — this call is what
 * actually unlocks Pro.
 */
export async function verifyIapPurchase(
  input: IapVerificationInput,
): Promise<IapVerificationResult> {
  const headers = authHeaders();
  if (!headers) throw new CloudAuthError();

  const res = await fetch(`${cloudUrl()}/v2/iap/verify`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(input),
    credentials: "omit",
    signal: AbortSignal.timeout(15_000),
  });

  if (res.status === 401) throw new CloudAuthError();

  // The verification endpoint isn't deployed yet (separate cloud repo). Treat a
  // missing/unimplemented route as "unavailable" rather than an error so the UI
  // degrades gracefully during the rollout.
  if (res.status === 404 || res.status === 501 || res.status === 503) {
    return { status: "unavailable" };
  }

  if (res.status === 402) return { status: "invalid" };

  if (!res.ok) throw new Error(`Receipt verification failed (${res.status})`);

  const data = (await res.json()) as {
    ok: boolean;
    unlimited?: boolean;
    plan?: "free" | "pro";
  };
  if (!data.ok) return { status: "invalid" };
  return {
    status: "verified",
    unlimited: data.unlimited ?? true,
    plan: data.plan ?? "pro",
  };
}
