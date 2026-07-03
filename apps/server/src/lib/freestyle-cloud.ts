import {
  type CleanupAppAssignment,
  type CleanupEmailTone,
  type CleanupOverallTone,
  type CleanupPersonalTone,
  type CleanupWorkTone,
  parseCleanupAppAssignments,
  parseCleanupEmailTone,
  parseCleanupOverallTone,
  parseCleanupPersonalTone,
  parseCleanupWorkTone,
} from "@freestyle-voice/validations";
import { createAuthClient } from "better-auth/client";
import { deviceAuthorizationClient } from "better-auth/client/plugins";
import { readSetting } from "./db.js";
import type { CloudUser } from "./sessions.js";
import { CLOUD_TRANSCRIBE_TIMEOUT_MS } from "./streaming/types.js";

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

/**
 * Build the WebSocket URL for the cloud streaming STT endpoint.
 * Converts `https://` → `wss://` and `http://` → `ws://`.
 */
export function freestyleCloudStreamWsUrl(): string {
  const base = freestyleCloudUrl();
  const wsBase = base.replace(/^http/, "ws");
  return `${wsBase}/v2/stream`;
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
  const res = await fetch(`${freestyleCloudUrl()}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      authorization: `Bearer ${token}`,
    },
    signal: init.signal ?? AbortSignal.timeout(CLOUD_TRANSCRIBE_TIMEOUT_MS),
  });
  if (res.status === 401) throw new FreestyleCloudAuthError();
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Freestyle Cloud request failed (${res.status})${detail ? `: ${detail}` : ""}`,
    );
  }
  return (await res.json()) as T;
}

export async function transcribeWithFreestyleCloud(opts: {
  token: string;
  audio: Uint8Array;
  language?: string;
  appContext?: string | null;
  mode: "raw" | "combined";
  intensity?: string;
  customPrompt?: string | null;
}): Promise<CloudTranscribeResult> {
  const audio = opts.audio as Uint8Array<ArrayBuffer>;

  // v2 carries the audio plus every cleanup preference in a single
  // multipart payload — the cloud no longer reads saved preferences.
  const form = new FormData();
  form.append("audio", new Blob([audio], { type: "audio/wav" }), "audio.wav");
  if (opts.language) form.append("language", opts.language);
  if (opts.appContext) form.append("appContext", opts.appContext);
  if (opts.mode === "raw") form.append("skipPostProcess", "true");
  if (opts.intensity) form.append("intensity", opts.intensity);
  if (opts.customPrompt) form.append("customPrompt", opts.customPrompt);

  return cloudJson<CloudTranscribeResult>("/v2/transcribe", opts.token, {
    method: "POST",
    // Do not set content-type: fetch adds the multipart boundary itself.
    body: form,
  });
}

export async function postProcessWithFreestyleCloud(opts: {
  token: string;
  text: string;
  appContext?: string | null;
  language?: string;
  intensity?: string;
  customPrompt?: string | null;
}): Promise<{
  cleaned: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}> {
  return cloudJson("/v2/post-process", opts.token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text: opts.text,
      appContext: opts.appContext ?? null,
      language: opts.language,
      intensity: opts.intensity,
      customPrompt: opts.customPrompt ?? null,
    }),
  });
}

/**
 * Sync cleanup preferences to Freestyle Cloud.
 * Called whenever the user changes their cleanup settings locally.
 */
export async function syncCleanupPreferences(opts: {
  token: string;
  intensity: string;
  customPrompt?: string | null;
  personalTone?: CleanupPersonalTone;
  workTone?: CleanupWorkTone;
  emailTone?: CleanupEmailTone;
  overallTone?: CleanupOverallTone;
  appAssignments?: CleanupAppAssignment[];
}): Promise<void> {
  await cloudJson("/v1/preferences", opts.token, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      intensity: opts.intensity,
      customPrompt: opts.customPrompt ?? null,
      personalTone: opts.personalTone,
      workTone: opts.workTone,
      emailTone: opts.emailTone,
      overallTone: opts.overallTone,
      appAssignments: opts.appAssignments,
    }),
  });
}

/**
 * Read the current local cleanup settings and push them to Freestyle Cloud.
 * Shared by the settings-write sync middleware and the post-sign-in hook, so
 * preferences configured while signed out reach the cloud without waiting for
 * the next edit. Async so a failed local read surfaces as a rejection the
 * caller can swallow.
 */
export async function pushLocalCleanupPreferences(
  token: string,
): Promise<void> {
  await syncCleanupPreferences({
    token,
    intensity: readSetting("cleanup_intensity") ?? "low",
    customPrompt: readSetting("cleanup_custom_prompt"),
    personalTone: parseCleanupPersonalTone(
      readSetting("cleanup_personal_tone"),
    ),
    workTone: parseCleanupWorkTone(readSetting("cleanup_work_tone")),
    emailTone: parseCleanupEmailTone(readSetting("cleanup_email_tone")),
    overallTone: parseCleanupOverallTone(readSetting("cleanup_overall_tone")),
    appAssignments: parseCleanupAppAssignments(
      readSetting("cleanup_app_assignments"),
    ),
  });
}

/**
 * Fetch the current usage balance from Freestyle Cloud.
 * Returns remaining credits, limit, total consumed, and window reset time.
 */
export async function fetchCloudUsage(
  token: string,
): Promise<CloudUsageBalance> {
  return cloudJson<CloudUsageBalance>("/v1/usage", token, {
    method: "GET",
    signal: AbortSignal.timeout(10_000),
  });
}
