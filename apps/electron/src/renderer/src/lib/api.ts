import type { AppType } from "@freestyle-voice/server";
import { hc } from "hono/client";

const DEFAULT_PORT = 4649;
const HEALTH_TIMEOUT_MS = 3000;
let resolvedPort: number = DEFAULT_PORT;
// Configured external server URL ("" = use the local server).
let serverUrl = "";
// Optional bearer token for a configured server ("" = none).
let serverToken = "";
let initialized = false;

/** Base URL of the locally-run server (used when no server URL is configured). */
export function getLocalApiBase(): string {
  return `http://127.0.0.1:${resolvedPort}`;
}

/** Base URL the app talks to: the configured server, or the local one. */
export function getApiBase(): string {
  return serverUrl || getLocalApiBase();
}

/** Bearer token for the configured server, or "" when none is set. */
export function getServerToken(): string {
  return serverToken;
}

/** True when pointed at a configured (non-loopback) server. */
export function isRemoteServer(): boolean {
  return !!serverUrl;
}

function authHeaders(token: string): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * fetch() against the configured Freestyle server: resolves the base URL and
 * injects the bearer token (when set), while preserving every caller init
 * option (method, body, keepalive, signal, custom headers).
 *
 * Use this only for the few requests the typed `hc` client can't express —
 * binary bodies (the WAV upload) and fire-and-forget beacons. Everything else
 * should go through {@link getClient}.
 */
export function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  // Additive — never clobber a header the caller set explicitly.
  for (const [key, value] of Object.entries(authHeaders(serverToken))) {
    if (!headers.has(key)) headers.set(key, value);
  }
  return fetch(`${getApiBase()}${path}`, { ...init, headers });
}

export async function initApiBase(): Promise<void> {
  if (initialized) return;
  await refreshApiBase();
  initialized = true;
}

/**
 * Verify a Freestyle server is reachable and identifies itself at `base`.
 * `/api/health` is unauthenticated, so this checks reachability only.
 */
export async function checkServerHealth(
  base: string,
  timeoutMs = HEALTH_TIMEOUT_MS,
): Promise<boolean> {
  try {
    const res = await hc<AppType>(base).api.health.$get(
      {},
      { init: { signal: AbortSignal.timeout(timeoutMs) } },
    );
    if (!res.ok) return false;
    const data = await res.json();
    return data.status === "ok" && data.name === "freestyle";
  } catch {
    return false;
  }
}

/**
 * Verify the bearer token is accepted by hitting an authenticated endpoint.
 * Returns true when the token is valid (or when no token is required).
 */
export async function checkServerAuth(
  base: string,
  token: string,
  timeoutMs = HEALTH_TIMEOUT_MS,
): Promise<boolean> {
  try {
    const res = await hc<AppType>(base, {
      headers: authHeaders(token),
    }).api.settings.$get(
      {},
      { init: { signal: AbortSignal.timeout(timeoutMs) } },
    );
    return res.ok;
  } catch {
    return false;
  }
}

/** Re-read the server location/token and verify it's reachable. */
export async function refreshApiBase(): Promise<boolean> {
  try {
    // Main returns an already-validated, normalized value.
    serverUrl = await window.api.getServerUrl();
  } catch {
    serverUrl = "";
  }
  try {
    serverToken = await window.api.getServerToken();
  } catch {
    serverToken = "";
  }
  if (!serverUrl) {
    try {
      resolvedPort = await window.api.getServerPort();
    } catch {
      resolvedPort = DEFAULT_PORT;
    }
  }
  return checkServerHealth(getApiBase(), HEALTH_TIMEOUT_MS);
}

export function getClient() {
  return hc<AppType>(getApiBase(), { headers: authHeaders(serverToken) });
}
