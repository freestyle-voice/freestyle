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
let apiBaseResolved = false;
let apiBaseResolution: Promise<void> | null = null;
// The in-flight health probe, shared so concurrent callers do not each run a
// redundant server check during the same startup tick.
let initPromise: Promise<void> | null = null;
const unauthorizedListeners = new Set<() => void>();

/**
 * Subscribe to definitive protected-request failures observed by either API
 * transport. A 401 is the server's authoritative signal that the locally
 * stored session can no longer be used; transport failures are deliberately
 * not reported here.
 */
export function subscribeToUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

async function observedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const response = await fetch(input, init);
  if (response.status === 401) {
    for (const listener of unauthorizedListeners) listener();
  }
  return response;
}

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
  return resolveApiBase().then(() => {
    const headers = new Headers(init.headers);
    // Additive — never clobber a header the caller set explicitly.
    for (const [key, value] of Object.entries(bearerAuthHeaders(serverToken))) {
      if (!headers.has(key)) headers.set(key, value);
    }
    return observedFetch(`${getApiBase()}${path}`, { ...init, headers });
  });
}

async function readApiBaseConfiguration(): Promise<void> {
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
}

/**
 * Resolve the configured server target without waiting on its health probe.
 * Startup callers need the correct base URL/token before they issue a request,
 * but the request itself can establish server availability in parallel.
 */
export async function resolveApiBase(): Promise<void> {
  if (apiBaseResolved) return;
  if (!apiBaseResolution) {
    apiBaseResolution = readApiBaseConfiguration().finally(() => {
      apiBaseResolved = true;
      apiBaseResolution = null;
    });
  }
  await apiBaseResolution;
}

export async function initApiBase(): Promise<void> {
  if (initialized) return;
  // Dedupe concurrent first-callers onto a single health probe so startup does
  // not fire duplicate checks in the same tick.
  if (!initPromise) {
    initPromise = resolveApiBase()
      .then(() => checkServerHealth(getApiBase(), HEALTH_TIMEOUT_MS))
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
  await readApiBaseConfiguration();
  apiBaseResolved = true;
  return checkServerHealth(getApiBase(), HEALTH_TIMEOUT_MS);
}

export function getClient() {
  const base = getApiBase();
  // Rebuild only when the resolved base URL or token actually changes (i.e.
  // after `refreshApiBase()` picks up a `server:changed` broadcast). The Hono
  // client is otherwise stable, so this avoids allocating a fresh one — and
  // re-parsing headers — on every query/mutation call site.
  if (!_client || _clientBase !== base || _clientToken !== serverToken) {
    _client = hc<AppType>(base, {
      headers: bearerAuthHeaders(serverToken),
      fetch: observedFetch,
    });
    _clientBase = base;
    _clientToken = serverToken;
  }
  return _client;
}
