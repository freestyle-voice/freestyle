/**
 * Freestyle Cloud connection settings. Mirrors the desktop app's
 * `apps/server/src/lib/freestyle-cloud.ts` so the mobile client talks to the
 * exact same managed backend (v2 routes) — no BYOK provider keys.
 */

import Constants from "expo-constants";

const DEFAULT_CLOUD_URL = "https://service.freestylevoice.com";

/**
 * Base URL for Freestyle Cloud. Resolution order:
 *   1. `EXPO_PUBLIC_CLOUD_URL` env var (set in `.env.local` for local dev —
 *      point it at your machine's LAN IP, e.g. `http://192.168.1.20:8787`, so
 *      a physical device running Expo Go can reach a locally-run cloud).
 *   2. `extra.freestyleCloudUrl` in app config.
 *   3. Production (`https://service.freestylevoice.com`).
 */
export function cloudUrl(): string {
  const fromEnv = process.env.EXPO_PUBLIC_CLOUD_URL;
  const fromConfig = (
    Constants.expoConfig?.extra as { freestyleCloudUrl?: string } | undefined
  )?.freestyleCloudUrl;
  return (fromEnv || fromConfig || DEFAULT_CLOUD_URL).replace(/\/+$/, "");
}

/** Base URL for the better-auth endpoints (mounted under `/auth`). */
export function cloudAuthUrl(): string {
  return `${cloudUrl()}/auth`;
}

/**
 * WebSocket URL for the v2 streaming STT endpoint. Converts `https` → `wss`
 * (and `http` → `ws` for local dev).
 */
export function cloudStreamWsUrl(): string {
  return `${cloudUrl().replace(/^http/, "ws")}/v2/stream`;
}

/**
 * StoreKit / Play Billing product IDs for the Freestyle Pro subscription.
 *
 * These must match the product identifiers created in App Store Connect and
 * Google Play Console. They are kept overridable via app config (`extra.iap`)
 * so a staging build can point at sandbox products without a code change, but
 * default to the production IDs.
 */
const DEFAULT_PRO_MONTHLY_ID = "com.freestylevoice.app.pro.monthly";
const DEFAULT_PRO_YEARLY_ID = "com.freestylevoice.app.pro.yearly";

interface IapConfig {
  proMonthlyId?: string;
  proYearlyId?: string;
}

function iapConfig(): IapConfig {
  return (
    (Constants.expoConfig?.extra as { iap?: IapConfig } | undefined)?.iap ?? {}
  );
}

/** Subscription product ID for monthly Freestyle Pro. */
export function proMonthlyProductId(): string {
  return (
    process.env.EXPO_PUBLIC_IAP_PRO_MONTHLY ||
    iapConfig().proMonthlyId ||
    DEFAULT_PRO_MONTHLY_ID
  );
}

/** Subscription product ID for annual Freestyle Pro. */
export function proYearlyProductId(): string {
  return (
    process.env.EXPO_PUBLIC_IAP_PRO_YEARLY ||
    iapConfig().proYearlyId ||
    DEFAULT_PRO_YEARLY_ID
  );
}

/** All Freestyle Pro subscription product IDs, monthly first. */
export function proProductIds(): string[] {
  return [proMonthlyProductId(), proYearlyProductId()];
}
