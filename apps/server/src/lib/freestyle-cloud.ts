// The shared client owns these error classes now. Import them under their
// historical `FreestyleCloud*Error` names (used both internally and by the rest
// of the desktop server) and re-export so downstream `instanceof` checks and
// imports from this module keep working unchanged.
import {
  createCloudClient,
  CloudAuthError as FreestyleCloudAuthError,
  CloudRequestError as FreestyleCloudRequestError,
  CloudUsageError as FreestyleCloudUsageError,
} from "@freestyle-voice/utils";
import type {
  CleanupAppAssignment,
  CleanupEmailTone,
  CleanupOverallTone,
  CleanupPersonalTone,
  CleanupWorkTone,
  CloudConfigResponse,
  CloudMemberPreferences,
  CloudProfile,
  MemberPreferencesInput,
  ProfileInput,
} from "@freestyle-voice/validations";
import { createAuthClient } from "better-auth/client";

export {
  FreestyleCloudAuthError,
  FreestyleCloudRequestError,
  FreestyleCloudUsageError,
};

import { deviceAuthorizationClient } from "better-auth/client/plugins";
import type { CloudUser } from "./sessions.js";
import { CLOUD_TRANSCRIBE_TIMEOUT_MS } from "./streaming/types.js";
import type { CloudVocabularyBias } from "./vocabulary.js";

export const FREESTYLE_CLOUD_PROVIDER_ID = "freestyle-cloud";
export const FREESTYLE_CLOUD_TRANSCRIBE_MODEL_ID = "freestyle-cloud/stt";
export const FREESTYLE_CLOUD_CLEANUP_MODEL_ID = "freestyle-cloud/post-process";

export const DEFAULT_CLOUD_URL = "https://service.freestylevoice.com";
const CLIENT_ID = "freestyle-desktop";
const DEVICE_GRANT = "urn:ietf:params:oauth:grant-type:device_code";

/**
 * The lifetime Freestyle Cloud grants a session token, in milliseconds (7 days).
 *
 * The cloud issues no refresh token; instead better-auth slides the expiry
 * forward by this amount whenever the session is validated after its 24h
 * `updateAge` window. We mirror that here when renewing locally: a successful
 * `get-session` call means the cloud extended the window, so we recompute the
 * local `expiresAt` from now. See `renewSession()`.
 */
export const SESSION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

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
/**
 * Thrown when Freestyle Cloud returns a non-OK response that isn't an auth
 * (401) or usage (429) failure. Carries the HTTP status so callers can tell an
 * upstream server fault (5xx) apart from a genuine app defect and avoid
 * reporting transient outages to error tracking.
 */
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
  /**
   * Subscription plan. Older cloud versions omit it — callers must treat an
   * absent value as "free".
   */
  plan?: "free" | "pro";
  /** True when the plan has no word limit (Pro). Absent means limited. */
  unlimited?: boolean;
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

/** WebSocket URL for the cloud streaming endpoint (`/v2/stream`). */
export function freestyleCloudStreamWsUrl(): string {
  return `${freestyleCloudUrl().replace(/^http/, "ws")}/v2/stream`;
}

/**
 * Fetch the public `GET /v2/config` payload: cleanup prompt config plus
 * region-based suggested languages. Unauthenticated and CDN-cacheable.
 * Language ordering is derived from the caller's IP geo by the cloud.
 * Industry defaults are now applied server-side at profile-update time and
 * are no longer returned by this endpoint.
 */
export async function fetchCloudConfig(): Promise<CloudConfigResponse> {
  const url = `${freestyleCloudUrl()}/v2/config`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(CLOUD_TRANSCRIBE_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new FreestyleCloudRequestError(res.status, `config fetch failed`);
  }
  return (await res.json()) as CloudConfigResponse;
}

/**
 * Currency-aware Pro pricing from the public `GET /v2/pricing` endpoint.
 * The cloud picks INR for India (via Cloudflare `cf.country`) and USD
 * otherwise; amounts come from Stripe multi-currency Price objects.
 * Unauthenticated and CDN-cacheable — display-only.
 */
export interface CloudPricing {
  currency: "usd" | "inr";
  /** Pro monthly plan billed monthly. */
  monthly: {
    /** Amount in the currency's smallest unit (e.g. cents / paise). */
    amount: number;
    /** Pre-formatted display string, e.g. "$12" or "₹999". */
    display: string;
  };
  /** Pro annual plan, expressed as the effective per-month price. */
  annual: {
    /** Per-month amount in the currency's smallest unit (annual total / 12). */
    amount: number;
    display: string;
  };
}

/**
 * Fetch the public geo-aware pricing payload. Unauthenticated. Currency is
 * derived from the caller's IP geo by the cloud (India → INR, else USD), so
 * the desktop's real egress IP is what matters — no `?country=` forwarding
 * is needed (unlike the Vercel-hosted marketing site).
 */
export async function fetchCloudPricing(): Promise<CloudPricing> {
  const url = `${freestyleCloudUrl()}/v2/pricing`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(CLOUD_TRANSCRIBE_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new FreestyleCloudRequestError(res.status, `pricing fetch failed`);
  }
  return (await res.json()) as CloudPricing;
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

/**
 * Shared cloud client for the desktop server: the base URL comes from the env
 * resolver and the default per-attempt timeout matches the transcribe budget.
 * The bearer token is supplied per-call (see {@link cloudJson}), so this client
 * carries no auth of its own.
 */
const cloudClient = createCloudClient({
  getBaseUrl: freestyleCloudUrl,
  getAuthHeaders: () => null,
  defaultTimeoutMs: CLOUD_TRANSCRIBE_TIMEOUT_MS,
});

/**
 * Issue an authenticated JSON request to Freestyle Cloud. Thin wrapper over the
 * shared client that injects the per-call bearer token; retry, timeout, and the
 * 401/429/!ok error taxonomy all live in `@freestyle-voice/utils`. Kept as a
 * `(path, token, init)` helper so the ~16 `cloud*` call sites are unchanged.
 */
function cloudJson<T>(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<T> {
  return cloudClient.json<T>(path, {
    ...init,
    headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}` },
  });
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
    /** Plugin-contributed system-prompt fragments (from `beforeCleanup` hook). */
    systemFragments?: string[];
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
  if (prefs.systemFragments && prefs.systemFragments.length > 0) {
    form.append("systemFragments", JSON.stringify(prefs.systemFragments));
  }
}

export async function transcribeWithFreestyleCloud(
  opts: {
    token: string;
    audio: Uint8Array;
    /** Preferred spoken languages (ISO codes); empty/omitted = auto-detect. */
    languages?: string[];
    appContext?: string | null;
    mode: "raw" | "combined";
    intensity?: string;
    customPrompt?: string | null;
    /** Custom-vocabulary bias to steer recognition (independent of cleanup). */
    vocabulary?: CloudVocabularyBias;
    /** Plugin-contributed system-prompt fragments (from `beforeCleanup` hook). */
    systemFragments?: string[];
  } & CloudCleanupTones,
): Promise<CloudTranscribeResult> {
  const audio = opts.audio as Uint8Array<ArrayBuffer>;

  // v2 carries the audio plus every cleanup preference in a single multipart
  // payload — the cloud no longer reads saved preferences. Cleanup fields are
  // sent only in "combined" mode; "raw" asks the cloud to skip post-processing.
  const form = new FormData();
  form.append("audio", new Blob([audio], { type: "audio/wav" }), "audio.wav");
  // The multipart transcribe endpoint expects `languages` as a JSON-encoded
  // string array (form fields are strings). Omit it entirely for auto-detect.
  if (opts.languages?.length) {
    form.append("languages", JSON.stringify(opts.languages));
  }
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
    /** Preferred spoken languages (ISO codes); empty/omitted = auto-detect. */
    languages?: string[];
    intensity?: string;
    customPrompt?: string | null;
    /** Plugin-contributed system-prompt fragments (from `beforeCleanup` hook). */
    systemFragments?: string[];
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
      // JSON body: `languages` is a real array. Omit for auto-detect.
      languages: opts.languages?.length ? opts.languages : undefined,
      intensity: opts.intensity,
      customPrompt: opts.customPrompt || undefined,
      personalTone: opts.personalTone,
      workTone: opts.workTone,
      emailTone: opts.emailTone,
      overallTone: opts.overallTone,
      appAssignments: opts.appAssignments,
      ...(opts.systemFragments && opts.systemFragments.length > 0
        ? { systemFragments: opts.systemFragments }
        : {}),
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

// ---------------------------------------------------------------------------
// Billing (Stripe via the cloud's Better Auth Stripe plugin)
// ---------------------------------------------------------------------------

/**
 * Where Stripe sends the browser after checkout completes/cancels. These land
 * on the marketing site — the desktop app detects the upgrade by polling
 * `/usage` until `plan` flips to "pro", not via a redirect back into the app.
 */
const CHECKOUT_SUCCESS_URL = "https://freestylevoice.com/checkout/success";
const CHECKOUT_CANCEL_URL = "https://freestylevoice.com/checkout/cancel";
const BILLING_PORTAL_RETURN_URL = "https://freestylevoice.com";
const BILLING_REQUEST_TIMEOUT_MS = 15_000;

function assertBillingUrl(url: unknown): asserts url is string {
  if (typeof url !== "string" || !url) {
    throw new Error("Freestyle Cloud billing response did not include a URL");
  }
}

/**
 * Create a Stripe hosted Checkout session for the Pro plan. Returns the URL
 * the user must open in their browser to pay.
 */
export async function createCheckoutSession(
  token: string,
  opts: { annual: boolean },
): Promise<{ url: string }> {
  const { url } = await cloudJson<{ url?: string; redirect?: boolean }>(
    "/auth/subscription/upgrade",
    token,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        plan: "pro",
        annual: opts.annual,
        successUrl: CHECKOUT_SUCCESS_URL,
        cancelUrl: CHECKOUT_CANCEL_URL,
      }),
      signal: AbortSignal.timeout(BILLING_REQUEST_TIMEOUT_MS),
    },
  );
  assertBillingUrl(url);
  return { url };
}

/**
 * Create a Stripe Billing Portal session (manage the subscription: payment
 * method, invoices, cancel). Uses `/auth/subscription/billing-portal` — the
 * portal home — rather than `/auth/subscription/cancel`, which pre-loads
 * Stripe's cancel-confirmation flow and is the wrong landing page for a
 * generic "Manage subscription" action. Returns the portal URL to open in the
 * user's browser.
 */
export async function createBillingPortalSession(
  token: string,
): Promise<{ url: string }> {
  const { url } = await cloudJson<{ url?: string; redirect?: boolean }>(
    "/auth/subscription/billing-portal",
    token,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ returnUrl: BILLING_PORTAL_RETURN_URL }),
      signal: AbortSignal.timeout(BILLING_REQUEST_TIMEOUT_MS),
    },
  );
  assertBillingUrl(url);
  return { url };
}

// ---------------------------------------------------------------------------
// Profile (name + linked social accounts, via the cloud's Better Auth endpoints)
// ---------------------------------------------------------------------------

const PROFILE_REQUEST_TIMEOUT_MS = 15_000;

/** A social provider the cloud supports linking against. */
export type SocialProvider = "github" | "google" | "apple";

/** A social account already linked to the signed-in user. */
export interface LinkedAccount {
  providerId: string;
}

/**
 * Update the signed-in user's display name via Better Auth's `update-user`
 * endpoint. The cloud only accepts `name`/`image` here; `email` changes are
 * rejected upstream.
 */
export async function updateCloudUserName(
  token: string,
  name: string,
): Promise<void> {
  await cloudJson<{ status?: boolean }>("/auth/update-user", token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name }),
    signal: AbortSignal.timeout(PROFILE_REQUEST_TIMEOUT_MS),
  });
}

/**
 * List the social accounts linked to the signed-in user. The cloud returns
 * richer rows; we surface only `providerId`, which is all the UI needs.
 */
export async function listCloudAccounts(
  token: string,
): Promise<LinkedAccount[]> {
  const rows = await cloudJson<{ providerId?: string }[]>(
    "/auth/list-accounts",
    token,
    {
      method: "GET",
      signal: AbortSignal.timeout(PROFILE_REQUEST_TIMEOUT_MS),
    },
  );
  return rows
    .filter(
      (r): r is { providerId: string } => typeof r.providerId === "string",
    )
    .map((r) => ({ providerId: r.providerId }));
}

/**
 * Begin linking a social account. `disableRedirect` makes the cloud return the
 * provider's OAuth URL instead of a 302 so the desktop can open it in the
 * system browser; the browser lands back on `callbackURL` once consent
 * completes and the app refetches the linked accounts.
 */
export async function linkCloudSocial(
  token: string,
  opts: { provider: SocialProvider; callbackURL: string },
): Promise<{ url: string }> {
  const { url } = await cloudJson<{ url?: string; redirect?: boolean }>(
    "/auth/link-social",
    token,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: opts.provider,
        callbackURL: opts.callbackURL,
        disableRedirect: true,
      }),
      signal: AbortSignal.timeout(PROFILE_REQUEST_TIMEOUT_MS),
    },
  );
  if (typeof url !== "string" || !url) {
    throw new Error("Freestyle Cloud link response did not include a URL");
  }
  return { url };
}

/**
 * Unlink a social account from the signed-in user. Better Auth prevents
 * unlinking the last remaining account by default (avoids lockout).
 */
export async function unlinkCloudAccount(
  token: string,
  providerId: SocialProvider,
): Promise<void> {
  await cloudJson<{ status?: boolean }>("/auth/unlink-account", token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ providerId }),
    signal: AbortSignal.timeout(PROFILE_REQUEST_TIMEOUT_MS),
  });
}

// ---------------------------------------------------------------------------
// Profile fields (industry / job title / company)
// ---------------------------------------------------------------------------
// These live on the member_preferences row and are served by the cloud's
// member preferences endpoint. The profile-field subset (industry/company/
// jobTitle) is a valid partial patch of that endpoint's schema.

/** Fetch the signed-in member's profile fields. */
export async function getCloudProfile(
  token: string,
  orgSlug: string,
): Promise<CloudProfile> {
  return cloudJson<CloudProfile>(`/${orgSlug}/member/preferences`, token, {
    method: "GET",
    signal: AbortSignal.timeout(PROFILE_REQUEST_TIMEOUT_MS),
  });
}

/**
 * Update the signed-in member's profile fields. When the industry changes the
 * cloud re-seeds tone + vocabulary defaults for the new industry (unless
 * `updatePreferences: false` is sent).
 */
export async function updateCloudProfile(
  token: string,
  orgSlug: string,
  data: ProfileInput,
): Promise<void> {
  await cloudJson<{ success?: boolean }>(
    `/${orgSlug}/member/preferences`,
    token,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(PROFILE_REQUEST_TIMEOUT_MS),
    },
  );
}

// ---------------------------------------------------------------------------
// Cloud-synced cleanup preferences (member-scoped)
// ---------------------------------------------------------------------------

/**
 * Fetch the signed-in member's cloud-synced cleanup preferences. Returns an
 * empty object when nothing has been synced yet (or when the user has no active
 * organization — the cloud replies 400, surfaced as a request error the caller
 * swallows).
 */
export async function getCloudPreferences(
  token: string,
  orgSlug: string,
): Promise<CloudMemberPreferences> {
  return cloudJson<CloudMemberPreferences>(
    `/${orgSlug}/member/preferences`,
    token,
    {
      method: "GET",
      signal: AbortSignal.timeout(PROFILE_REQUEST_TIMEOUT_MS),
    },
  );
}

/**
 * Push a partial preferences patch to the cloud. Only the fields present in
 * `data` are written; the nested `vocabulary` object is deep-merged upstream.
 */
export async function putCloudPreferences(
  token: string,
  orgSlug: string,
  data: MemberPreferencesInput,
): Promise<{ syncedAt?: string }> {
  return cloudJson<{ success?: boolean; syncedAt?: string }>(
    `/${orgSlug}/member/preferences`,
    token,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(PROFILE_REQUEST_TIMEOUT_MS),
    },
  );
}

// ---------------------------------------------------------------------------
// Organizations (via the cloud's Better Auth Organization plugin)
// ---------------------------------------------------------------------------

/** An organization the signed-in user belongs to. */
export interface CloudOrganization {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

/**
 * List all organizations the signed-in user is a member of.
 * Maps to `GET /auth/organization/list`.
 */
export async function listCloudOrganizations(
  token: string,
): Promise<CloudOrganization[]> {
  return cloudJson<CloudOrganization[]>("/auth/organization/list", token, {
    method: "GET",
    signal: AbortSignal.timeout(PROFILE_REQUEST_TIMEOUT_MS),
  });
}

/** The full organization details returned by `get-full-organization`. */
export interface CloudFullOrganization {
  id: string;
  name: string;
  slug: string;
  logo?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  members: {
    id: string;
    userId: string;
    organizationId: string;
    role: string;
    createdAt: string;
    user: {
      id: string;
      name: string;
      email: string;
      image?: string | null;
    };
  }[];
}

/**
 * Get the full details of the user's active organization (or a specific org
 * by ID). Maps to `GET /auth/organization/get-full-organization`.
 */
export async function getCloudActiveOrganization(
  token: string,
  organizationId?: string,
): Promise<CloudFullOrganization | null> {
  const params = new URLSearchParams();
  if (organizationId) params.set("organizationId", organizationId);
  const query = params.toString();
  const path = `/auth/organization/get-full-organization${query ? `?${query}` : ""}`;
  try {
    return await cloudJson<CloudFullOrganization>(path, token, {
      method: "GET",
      signal: AbortSignal.timeout(PROFILE_REQUEST_TIMEOUT_MS),
    });
  } catch (err) {
    // If no active org is set, the cloud returns an error — return null.
    if (
      err instanceof FreestyleCloudRequestError &&
      err.status >= 400 &&
      err.status < 500
    ) {
      return null;
    }
    throw err;
  }
}

/**
 * Set the user's active organization on the cloud session.
 * Maps to `POST /auth/organization/set-active`.
 */
export async function setCloudActiveOrganization(
  token: string,
  organizationId: string,
): Promise<void> {
  await cloudJson<{ id?: string }>("/auth/organization/set-active", token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ organizationId }),
    signal: AbortSignal.timeout(PROFILE_REQUEST_TIMEOUT_MS),
  });
}

/**
 * Cached active-organization slug, keyed by session token. Profile and
 * preferences endpoints are org-scoped (`/{slug}/...`), so we resolve the
 * active org's slug once per session and reuse it. Cleared on sign-out and
 * whenever the active org changes.
 */
let cachedOrgSlug: { token: string; slug: string } | null = null;

/** Drop the cached org slug (call on sign-out or after switching orgs). */
export function clearCachedOrgSlug(): void {
  cachedOrgSlug = null;
}

/**
 * Resolve the slug of the signed-in user's active organization, needed to build
 * the org-scoped `/{slug}/member/*` paths (profile + preferences). Memoized per
 * token. Returns `null` when there is no active org (e.g. the post-signup window
 * before the session picks one up), in which case callers should skip the
 * org-scoped request.
 */
export async function resolveActiveOrgSlug(
  token: string,
): Promise<string | null> {
  if (cachedOrgSlug && cachedOrgSlug.token === token) return cachedOrgSlug.slug;
  const org = await getCloudActiveOrganization(token);
  const slug = org?.slug ?? null;
  if (slug) cachedOrgSlug = { token, slug };
  return slug;
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
