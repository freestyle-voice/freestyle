import type { AppType } from "@freestyle-voice/server";
import { hc } from "hono/client";
import { bearerAuthHeaders } from "../../../shared/server-auth";

const DEFAULT_PORT = 4649;
const HEALTH_TIMEOUT_MS = 3000;
let resolvedPort: number = DEFAULT_PORT;
// Configured external server URL ("" = use the local server).
let serverUrl = "";
// Optional bearer token for a configured server ("" = none).
let serverToken = "";
// Memoized Hono client, rebuilt only when the base URL or token changes.
let _client: ReturnType<typeof hc<AppType>> | null = null;
let _clientBase = "";
let _clientToken = "";
let initialized = false;
// The in-flight init, shared so concurrent callers (e.g. the module-load
// prefetch and the auth provider) don't each run a redundant refreshApiBase().
let initPromise: Promise<void> | null = null;

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
  for (const [key, value] of Object.entries(bearerAuthHeaders(serverToken))) {
    if (!headers.has(key)) headers.set(key, value);
  }
  return fetch(`${getApiBase()}${path}`, { ...init, headers });
}

export async function initApiBase(): Promise<void> {
  if (initialized) return;
  // Dedupe concurrent first-callers onto a single refreshApiBase() so startup
  // doesn't fire the server-URL/token/health probe twice in the same tick.
  if (!initPromise) {
    initPromise = refreshApiBase()
      .then((healthy) => {
        initialized = healthy;
      })
      .finally(() => {
        initPromise = null;
      });
  }
  await initPromise;
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
      headers: bearerAuthHeaders(token),
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
  const base = getApiBase();
  // Rebuild only when the resolved base URL or token actually changes (i.e.
  // after `refreshApiBase()` picks up a `server:changed` broadcast). The Hono
  // client is otherwise stable, so this avoids allocating a fresh one — and
  // re-parsing headers — on every query/mutation call site.
  if (!_client || _clientBase !== base || _clientToken !== serverToken) {
    _client = hc<AppType>(base, { headers: bearerAuthHeaders(serverToken) });
    _clientBase = base;
    _clientToken = serverToken;
  }
  return _client;
}
