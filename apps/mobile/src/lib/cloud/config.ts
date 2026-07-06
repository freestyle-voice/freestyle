/**
 * Freestyle Cloud connection settings. Mirrors the desktop app's
 * `apps/server/src/lib/freestyle-cloud.ts` so the mobile client talks to the
 * exact same managed backend (v2 routes) — no BYOK provider keys.
 */

import Constants from "expo-constants";

const DEFAULT_CLOUD_URL = "https://service.freestylevoice.com";

/**
 * Base URL for Freestyle Cloud. Overridable at build time via the
 * `extra.freestyleCloudUrl` app config value (useful for staging), falling
 * back to production.
 */
export function cloudUrl(): string {
  const configured = (
    Constants.expoConfig?.extra as { freestyleCloudUrl?: string } | undefined
  )?.freestyleCloudUrl;
  return (configured || DEFAULT_CLOUD_URL).replace(/\/+$/, "");
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
