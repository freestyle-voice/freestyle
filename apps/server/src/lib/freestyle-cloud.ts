import { createAuthClient } from "better-auth/client";
import { deviceAuthorizationClient } from "better-auth/client/plugins";
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
  const res = await fetch(`${freestyleCloudUrl()}/v1/me`, {
    headers: { authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 401) throw new FreestyleCloudAuthError();
  if (!res.ok) throw new Error(`Failed to load profile (${res.status})`);
  const data = (await res.json()) as { user: CloudUser };
  return data.user;
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
}): Promise<CloudTranscribeResult> {
  const headers: Record<string, string> = {};
  if (opts.language) headers["x-language"] = opts.language;
  if (opts.appContext)
    headers["x-app-context"] = encodeURIComponent(opts.appContext);
  if (opts.mode === "raw") headers["x-freestyle-mode"] = "transcribe";
  const audio = opts.audio as Uint8Array<ArrayBuffer>;

  return cloudJson<CloudTranscribeResult>("/v1/transcribe", opts.token, {
    method: "POST",
    headers,
    body: new Blob([audio], { type: "audio/wav" }),
  });
}

export async function postProcessWithFreestyleCloud(opts: {
  token: string;
  text: string;
  appContext?: string | null;
  language?: string;
}): Promise<{
  cleaned: string;
  usage?: { inputTokens?: number; outputTokens?: number };
}> {
  return cloudJson("/v1/post-process", opts.token, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      text: opts.text,
      appContext: opts.appContext ?? null,
      language: opts.language,
    }),
  });
}
