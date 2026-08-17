/**
 * Shared Freestyle Cloud HTTP client. One fetch wrapper used by both the desktop
 * server (`apps/server`, Node 22) and the mobile app (`apps/mobile`, Expo/RN),
 * so auth-header injection, timeouts, the connection-phase retry, and the
 * `401 -> Auth / 429 -> Usage / !ok -> Request` error taxonomy live in one place.
 *
 * Runtime-agnostic: uses only the global `fetch` + `AbortSignal.timeout`, both of
 * which exist on Node 22 and React Native 0.86/Hermes. It imports nothing from
 * `node:*`, `undici`, or `expo-*`.
 *
 * The caller injects the two things that genuinely differ between platforms:
 *   - `getBaseUrl()`  -> desktop reads `process.env`, mobile reads expo-constants
 *   - `getAuthHeaders()` -> desktop returns `{ authorization: 'Bearer <token>' }`,
 *                           mobile returns `{ Cookie: <session-cookie> }`
 */

import {
  CloudAuthError,
  CloudRequestError,
  CloudUsageError,
} from "./cloud-errors.js";

/**
 * Connection-level fault codes where the request never reached the server, so
 * retrying a non-idempotent POST is safe. Deliberately narrow: it excludes
 * response-phase timeouts (`UND_ERR_HEADERS_TIMEOUT`/`UND_ERR_BODY_TIMEOUT`) and
 * generic aborts, where the request may already be processing server-side and a
 * retry could double up (e.g. double-charge a transcribe). The `UND_ERR_*` codes
 * are undici-specific and simply never appear on React Native — harmless there.
 */
const RETRIABLE_CONNECTION_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
]);

/**
 * True when a request threw before reaching the server on a reused connection.
 * The dominant case is a stale keep-alive socket: the pool hands out a connection
 * that an idle timeout or NAT/middlebox silently dropped, then the first write on
 * resume gets an RST — surfaced as `TypeError: fetch failed` with
 * `code === "ECONNRESET"` on the cause chain. Since the request never landed, a
 * single retry on a fresh socket recovers it safely. Cycle-guarded.
 */
function isRetriableConnectionError(err: unknown): boolean {
  const seen = new Set<unknown>();
  let current: unknown = err;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && RETRIABLE_CONNECTION_CODES.has(code)) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** One extra attempt after the initial request (2 total). */
const CLOUD_FETCH_ATTEMPTS = 2;
/** Brief pause before retrying so we don't tight-loop on a refused connection. */
const CLOUD_RETRY_DELAY_MS = 150;
/** Default per-attempt timeout when the caller supplies neither signal nor timeoutMs. */
const DEFAULT_TIMEOUT_MS = 120_000;

export interface CloudClientConfig {
  /** Resolved base URL, no trailing slash. Injected per app. */
  getBaseUrl: () => string;
  /**
   * Auth headers for a request, or `null` when the user is signed out. When it
   * returns `null` (and the request isn't `anonymous`), the client throws
   * {@link CloudAuthError} before issuing the fetch.
   */
  getAuthHeaders: () => Record<string, string> | null;
  /** Forwarded to `fetch` (e.g. `"omit"` on mobile; omitted on desktop). */
  credentials?: RequestCredentials;
  /** Per-attempt timeout applied only when the caller passes no signal/timeoutMs. */
  defaultTimeoutMs?: number;
}

export interface CloudRequestInit extends Omit<RequestInit, "body"> {
  body?: RequestInit["body"];
  /**
   * Convenience: JSON.stringify the value and default `content-type:
   * application/json` (unless the caller already set one). Mutually exclusive
   * with `body`.
   */
  json?: unknown;
  /** Per-request timeout (ms), used only when no explicit `signal` is given. */
  timeoutMs?: number;
  /** Skip the auth-header requirement for unauthenticated endpoints. */
  anonymous?: boolean;
}

export interface CloudClient {
  /** Issue a request and return the raw `Response` (no status/JSON handling). */
  request(path: string, init?: CloudRequestInit): Promise<Response>;
  /**
   * Issue a request and parse a JSON body, mapping cloud error statuses:
   *   401 -> CloudAuthError, 429 -> CloudUsageError(resetsAt),
   *   other !ok -> CloudRequestError(status, detail), else `res.json() as T`.
   */
  json<T>(path: string, init?: CloudRequestInit): Promise<T>;
}

/**
 * Build a cloud client bound to a base URL + auth strategy. Both are read fresh
 * on every request (so a changed server URL or a new session cookie is picked up
 * without re-creating the client).
 */
export function createCloudClient(config: CloudClientConfig): CloudClient {
  const defaultTimeoutMs = config.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function request(
    path: string,
    init: CloudRequestInit = {},
  ): Promise<Response> {
    const { json, timeoutMs, anonymous, headers, body, ...rest } = init;

    const finalHeaders: Record<string, string> = {
      ...(headers as Record<string, string> | undefined),
    };

    // JSON sugar: stringify + default content-type without clobbering the caller.
    let finalBody = body;
    if (json !== undefined) {
      finalBody = JSON.stringify(json);
      if (
        !Object.keys(finalHeaders).some(
          (k) => k.toLowerCase() === "content-type",
        )
      ) {
        finalHeaders["content-type"] = "application/json";
      }
    }

    // Resolve auth. `getAuthHeaders` returning null means "signed out" — but a
    // caller may instead supply auth per-request (the desktop server injects a
    // per-call `authorization: Bearer <token>` header and configures
    // `getAuthHeaders: () => null`). So we only treat a null result as a
    // sign-in error when the caller ALSO provided no auth header of its own.
    // Resolved auth headers are merged OVER caller headers so a configured
    // `authorization`/`Cookie` can't be accidentally overridden.
    if (!anonymous) {
      const auth = config.getAuthHeaders();
      const callerHasAuth = Object.keys(finalHeaders).some((k) => {
        const lower = k.toLowerCase();
        return lower === "authorization" || lower === "cookie";
      });
      if (!auth && !callerHasAuth) throw new CloudAuthError();
      if (auth) Object.assign(finalHeaders, auth);
    }

    const url = `${config.getBaseUrl()}${path}`;
    let res: Response | undefined;
    for (let attempt = 0; attempt < CLOUD_FETCH_ATTEMPTS; attempt++) {
      try {
        res = await fetch(url, {
          ...rest,
          body: finalBody,
          headers: finalHeaders,
          ...(config.credentials ? { credentials: config.credentials } : {}),
          // A fresh per-attempt timeout when the caller didn't supply a signal,
          // so a retry isn't handicapped by the first attempt's elapsed clock.
          signal:
            rest.signal ?? AbortSignal.timeout(timeoutMs ?? defaultTimeoutMs),
        });
        break;
      } catch (err) {
        // Retry once on a stale-socket reset (request never reached the server).
        // Anything else — including response-phase timeouts — propagates as-is.
        if (
          attempt === CLOUD_FETCH_ATTEMPTS - 1 ||
          !isRetriableConnectionError(err)
        ) {
          throw err;
        }
        await new Promise((r) => setTimeout(r, CLOUD_RETRY_DELAY_MS));
      }
    }
    // Unreachable: the loop either assigns `res` or throws on the final attempt.
    if (!res) throw new Error("Freestyle Cloud request produced no response");
    return res;
  }

  async function json<T>(path: string, init?: CloudRequestInit): Promise<T> {
    const res = await request(path, init);
    if (res.status === 401) throw new CloudAuthError();
    if (res.status === 429) {
      const body = (await res.json().catch(() => null)) as {
        code?: unknown;
        resetsAt?: unknown;
      } | null;
      if (body?.code === "rate_limited") {
        throw new CloudRequestError(429, "Too many requests");
      }
      throw new CloudUsageError(
        typeof body?.resetsAt === "string" ? body.resetsAt : null,
      );
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new CloudRequestError(res.status, detail);
    }
    return (await res.json()) as T;
  }

  return { request, json };
}
