import type {
  CleanupAppAssignment,
  CleanupEmailTone,
  CleanupOverallTone,
  CleanupPersonalTone,
  CleanupWorkTone,
} from "@freestyle-voice/validations";
import { createAuthClient } from "better-auth/client";
import { deviceAuthorizationClient } from "better-auth/client/plugins";
import type { CloudUser } from "./sessions.js";
import { CLOUD_TRANSCRIBE_TIMEOUT_MS } from "./streaming/types.js";
import type { CloudVocabularyBias } from "./vocabulary.js";

export const FREESTYLE_CLOUD_PROVIDER_ID = "freestyle-cloud";
export const FREESTYLE_CLOUD_TRANSCRIBE_MODEL_ID = "freestyle-cloud/stt";
export const FREESTYLE_CLOUD_CLEANUP_MODEL_ID = "freestyle-cloud/post-process";

const DEFAULT_CLOUD_URL = "https://service.freestylevoice.com";
const CLIENT_ID = "freestyle-desktop";
const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

export class FreestyleCloudAuthError extends Error {
  constructor(message = "Freestyle Cloud sign-in required") {
    super(message);
    this.name = "FreestyleCloudAuthError";
  }
}

export class DeviceFlowError extends Error {
  constructor(
    readonly code: string,
    message = code,
  ) {
    super(message);
    this.name = "DeviceFlowError";
  }
}

/**
 * Thrown when Freestyle Cloud rejects a request because the user exhausted
 * their usage allowance (HTTP 429). Distinct from a generic request failure so
 * callers can surface an actionable "limit reached" message instead of a 500,
 * and so it is never reported to error tracking as an app defect.
 */
export class FreestyleCloudUsageError extends Error {
  constructor(readonly resetsAt: string | null = null) {
    super("Freestyle Cloud usage limit reached");
    this.name = "FreestyleCloudUsageError";
  }
}

/**
 * Thrown when Freestyle Cloud returns a non-OK response that isn't an auth
 * (401) or usage (429) failure. Carries the HTTP status so callers can tell an
 * upstream server fault (5xx) apart from a genuine app defect and avoid
 * reporting transient outages to error tracking.
 */
export class FreestyleCloudRequestError extends Error {
  constructor(
    readonly status: number,
    readonly detail = "",
  ) {
    super(
      `Freestyle Cloud request failed (${status})${detail ? `: ${detail}` : ""}`,
    );
    this.name = "FreestyleCloudRequestError";
  }
}

const TRANSIENT_NETWORK_CODES = new Set([
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EPIPE",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
]);

/**
 * True when a request failed for reasons outside the desktop app's control:
 * transient network faults (connection resets, DNS hiccups, timeouts) or an
 * upstream 5xx response. `fetch` (undici) surfaces socket errors as a
 * `TypeError: fetch failed` with the real cause on `.cause`, and timeouts as an
 * abort — so we walk the cause chain looking for a known network code or abort.
 * These should be surfaced to the user but never captured as app defects.
 */
export function isTransientCloudError(err: unknown): boolean {
  if (err instanceof FreestyleCloudRequestError) return err.status >= 500;

  const seen = new Set<unknown>();
  let current: unknown = err;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const e = current as {
      name?: unknown;
      code?: unknown;
      cause?: unknown;
    };
    if (typeof e.code === "string" && TRANSIENT_NETWORK_CODES.has(e.code)) {
      return true;
    }
    if (e.name === "TimeoutError" || e.name === "AbortError") return true;
    current = e.cause;
  }
  return false;
}

/**
 * Connection-level faults where the request never reached the server, so
 * retrying a non-idempotent POST is safe. This is deliberately narrower than
 * {@link TRANSIENT_NETWORK_CODES}: it excludes response-phase timeouts
 * (`UND_ERR_HEADERS_TIMEOUT`/`UND_ERR_BODY_TIMEOUT`) and generic aborts, where
 * the request may already be processing server-side and a retry could double
 * up (e.g. double-charge a transcribe).
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
 * The dominant case is a stale keep-alive socket: undici pools a connection
 * that an idle timeout or NAT/middlebox silently dropped, then the first write
 * on resume gets an RST — surfaced as `TypeError: fetch failed` with
 * `code === "ECONNRESET"` on the cause chain. Since the request never landed,
 * a single retry on a fresh socket recovers it safely.
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

export interface DeviceCodeResult {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval: number;
}

export interface DeviceTokenResult {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

export interface CloudUsageBalance {
  remaining: number;
  limit: number;
  totalConsumed: number;
  windowStart: string;
  resetsAt: string;
}

export interface CloudTranscribeResult {
  raw: string;
  cleaned: string;
  audioDurationSeconds: number | null;
  usage?: { inputTokens?: number; outputTokens?: number };
}

function authClientErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const e = error as Record<string, unknown>;
  return typeof e.error === "string"
    ? e.error
    : typeof e.code === "string"
      ? e.code
      : undefined;
}

function authClientErrorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== "object") return fallback;
  const e = error as Record<string, unknown>;
  return typeof e.message === "string"
    ? e.message
    : typeof e.error_description === "string"
      ? e.error_description
      : fallback;
}

function authClientErrorStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const e = error as Record<string, unknown>;
  return typeof e.status === "number" ? e.status : undefined;
}

export function freestyleCloudUrl(): string {
  return (process.env.FREESTYLE_CLOUD_URL || DEFAULT_CLOUD_URL).replace(
    /\/+$/,
    "",
  );
}

function createCloudAuthClient() {
  return createAuthClient({
    baseURL: `${freestyleCloudUrl()}/auth`,
    disableDefaultFetchPlugins: true,
    plugins: [deviceAuthorizationClient()],
  });
}

export async function requestDeviceCode(): Promise<DeviceCodeResult> {
  const { data, error } = await createCloudAuthClient().device.code({
    client_id: CLIENT_ID,
  });
  if (error || !data) {
    throw new Error(authClientErrorMessage(error, "Could not start sign-in"));
  }
  return data;
}

export async function pollDeviceToken(
  deviceCode: string,
): Promise<DeviceTokenResult> {
  const { data, error } = await createCloudAuthClient().device.token({
    grant_type: DEVICE_GRANT,
    device_code: deviceCode,
    client_id: CLIENT_ID,
  });
  if (data?.access_token) return data;

  const code = authClientErrorCode(error);
  if (code === "authorization_pending" || code === "slow_down") {
    throw new DeviceFlowError(code);
  }
  if (code === "access_denied") {
    throw new DeviceFlowError(code, "Sign-in was denied.");
  }
  if (code === "expired_token") {
    throw new DeviceFlowError(
      code,
      "Sign-in request expired. Please try again.",
    );
  }
  if (code === "invalid_grant") throw new DeviceFlowError(code);
  throw new Error(authClientErrorMessage(error, "Device token request failed"));
}

export async function fetchCloudUser(token: string): Promise<CloudUser> {
  const { data, error } = await createCloudAuthClient().getSession({
    fetchOptions: {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    },
  });
  if (authClientErrorStatus(error) === 401) throw new FreestyleCloudAuthError();
  if (error || !data?.user) {
    throw new Error(authClientErrorMessage(error, "Failed to load profile"));
  }
  const { id, email, name, image } = data.user;
  return { id, email, name, image };
}

export async function signOutCloud(token: string): Promise<void> {
  await fetch(`${freestyleCloudUrl()}/auth/sign-out`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
}

async function cloudJson<T>(
  path: string,
  token: string,
  init: RequestInit,
): Promise<T> {
  const url = `${freestyleCloudUrl()}${path}`;
  let res: Response | undefined;
  for (let attempt = 0; attempt < CLOUD_FETCH_ATTEMPTS; attempt++) {
    try {
      res = await fetch(url, {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          authorization: `Bearer ${token}`,
        },
        // A fresh per-attempt timeout when the caller didn't supply a signal,
        // so a retry isn't handicapped by the first attempt's elapsed clock.
        signal: init.signal ?? AbortSignal.timeout(CLOUD_TRANSCRIBE_TIMEOUT_MS),
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
  if (res.status === 401) throw new FreestyleCloudAuthError();
  if (res.status === 429) {
    const resetsAt = await res
      .json()
      .then((b) =>
        b && typeof (b as { resetsAt?: unknown }).resetsAt === "string"
          ? (b as { resetsAt: string }).resetsAt
          : null,
      )
      .catch(() => null);
    throw new FreestyleCloudUsageError(resetsAt);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new FreestyleCloudRequestError(res.status, detail);
  }
  return (await res.json()) as T;
}

/**
 * Destination-aware tone preferences forwarded to Freestyle Cloud in the v2
 * payload. The cloud resolves the destination (from `appContext` +
 * `appAssignments`) and applies the matching tone when assembling the cleanup
 * prompt server-side — the desktop no longer needs to pre-compute a
 * destination for the cloud path.
 */
export interface CloudCleanupTones {
  personalTone?: CleanupPersonalTone;
  workTone?: CleanupWorkTone;
  emailTone?: CleanupEmailTone;
  overallTone?: CleanupOverallTone;
  appAssignments?: CleanupAppAssignment[];
}

/**
 * Append cleanup preference fields (intensity, custom prompt, tones, and
 * per-app assignments) to a multipart form. Form values are strings, so
 * `appAssignments` is JSON-encoded to match the `/v2/transcribe` contract.
 */
function appendCleanupFormFields(
  form: FormData,
  prefs: {
    intensity?: string;
    customPrompt?: string | null;
  } & CloudCleanupTones,
): void {
  if (prefs.intensity) form.append("intensity", prefs.intensity);
  if (prefs.customPrompt) form.append("customPrompt", prefs.customPrompt);
  if (prefs.personalTone) form.append("personalTone", prefs.personalTone);
  if (prefs.workTone) form.append("workTone", prefs.workTone);
  if (prefs.emailTone) form.append("emailTone", prefs.emailTone);
  if (prefs.overallTone) form.append("overallTone", prefs.overallTone);
  if (prefs.appAssignments && prefs.appAssignments.length > 0) {
    form.append("appAssignments", JSON.stringify(prefs.appAssignments));
  }
}

export async function transcribeWithFreestyleCloud(
  opts: {
    token: string;
    audio: Uint8Array;
    language?: string;
    appContext?: string | null;
    mode: "raw" | "combined";
    intensity?: string;
    customPrompt?: string | null;
    /** Custom-vocabulary bias to steer recognition (independent of cleanup). */
    vocabulary?: CloudVocabularyBias;
  } & CloudCleanupTones,
): Promise<CloudTranscribeResult> {
  const audio = opts.audio as Uint8Array<ArrayBuffer>;

  // v2 carries the audio plus every cleanup preference in a single multipart
  // payload — the cloud no longer reads saved preferences. Cleanup fields are
  // sent only in "combined" mode; "raw" asks the cloud to skip post-processing.
  const form = new FormData();
  form.append("audio", new Blob([audio], { type: "audio/wav" }), "audio.wav");
  if (opts.language) form.append("language", opts.language);
  if (opts.appContext) form.append("appContext", opts.appContext);
  // Vocabulary bias applies to the recognizer regardless of cleanup mode.
  if (opts.vocabulary?.terms.length) {
    form.append("vocabulary", JSON.stringify(opts.vocabulary));
  }
  if (opts.mode === "raw") {
    form.append("skipPostProcess", "true");
  } else {
    appendCleanupFormFields(form, opts);
  }

  return cloudJson<CloudTranscribeResult>("/v2/transcribe", opts.token, {
    method: "POST",
    // Do not set content-type: fetch adds the multipart boundary itself.
    body: form,
  });
}

export async function postProcessWithFreestyleCloud(
  opts: {
    token: string;
    text: string;
    appContext?: string | null;
    language?: string;
    intensity?: string;
    customPrompt?: string | null;
  } & CloudCleanupTones,
): Promise<{
  cleaned: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}> {
  // The JSON body carries `appAssignments` as a real array (unlike the
  // multipart transcribe path, which JSON-encodes it). `customPrompt` is
  // omitted (not sent as null) when absent: the cloud schema validates it as
  // `z.string().optional()`, which rejects an explicit null with a 400.
  return cloudJson("/v2/post-process", opts.token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text: opts.text,
      appContext: opts.appContext ?? null,
      language: opts.language,
      intensity: opts.intensity,
      customPrompt: opts.customPrompt || undefined,
      personalTone: opts.personalTone,
      workTone: opts.workTone,
      emailTone: opts.emailTone,
      overallTone: opts.overallTone,
      appAssignments: opts.appAssignments,
    }),
  });
}

/**
 * Fetch the current usage balance from Freestyle Cloud.
 * Returns remaining credits, limit, total consumed, and window reset time.
 */
export async function fetchCloudUsage(
  token: string,
): Promise<CloudUsageBalance> {
  return cloudJson<CloudUsageBalance>("/usage", token, {
    method: "GET",
    signal: AbortSignal.timeout(10_000),
  });
}

/** Upper bound for the best-effort connection prewarm. */
const CLOUD_PREWARM_TIMEOUT_MS = 5_000;

let cloudPrewarmPromise: Promise<void> | null = null;

/**
 * Warm the TLS connection to Freestyle Cloud while the user is still speaking,
 * so the transcribe/cleanup POST on commit reuses a hot socket instead of
 * paying the DNS+TCP+TLS handshake on the critical path. A cheap authenticated
 * GET to `/usage` opens the connection, which undici then pools by origin for
 * the real request. Fire-and-forget: concurrent calls dedupe and failures are
 * swallowed — the lazy connect on the actual request remains the fallback.
 */
export function prewarmFreestyleCloudConnection(token: string): void {
  if (cloudPrewarmPromise) return;
  cloudPrewarmPromise = (async () => {
    try {
      await fetch(`${freestyleCloudUrl()}/usage`, {
        method: "GET",
        headers: { authorization: `Bearer ${token}` },
        keepalive: true,
        signal: AbortSignal.timeout(CLOUD_PREWARM_TIMEOUT_MS),
      });
    } catch {
      // Best-effort — nothing to do; the real request will connect lazily.
    } finally {
      cloudPrewarmPromise = null;
    }
  })();
}
