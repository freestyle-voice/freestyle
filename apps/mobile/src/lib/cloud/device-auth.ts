/**
 * OAuth 2.0 Device Authorization Grant against Freestyle Cloud.
 *
 * Flow (mirrors the desktop):
 *   1. `requestDeviceCode()` → show the user a short `user_code` and open the
 *      `verification_uri_complete` in a browser to approve.
 *   2. Poll `pollDeviceToken()` on the server-provided `interval` until it
 *      returns an access token (or the user denies / it expires).
 */

import { createCloudAuthClient } from "./auth-client";
import { CLOUD_CLIENT_ID, DEVICE_GRANT } from "./config";

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

/**
 * Terminal and transient device-flow error codes. `DevicePendingError` is
 * expected while the user hasn't approved yet — callers keep polling.
 */
export class DevicePendingError extends Error {
  constructor(readonly slowDown: boolean) {
    super(slowDown ? "slow_down" : "authorization_pending");
    this.name = "DevicePendingError";
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

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const e = error as Record<string, unknown>;
  if (typeof e.error === "string") return e.error;
  if (typeof e.code === "string") return e.code;
  return undefined;
}

function errorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== "object") return fallback;
  const e = error as Record<string, unknown>;
  if (typeof e.message === "string") return e.message;
  if (typeof e.error_description === "string") return e.error_description;
  return fallback;
}

export async function requestDeviceCode(): Promise<DeviceCodeResult> {
  const { data, error } = await createCloudAuthClient().device.code({
    client_id: CLOUD_CLIENT_ID,
  });
  if (error || !data) {
    throw new DeviceFlowError(
      "request_failed",
      errorMessage(error, "Could not start sign-in"),
    );
  }
  return data as DeviceCodeResult;
}

export async function pollDeviceToken(
  deviceCode: string,
): Promise<DeviceTokenResult> {
  const { data, error } = await createCloudAuthClient().device.token({
    grant_type: DEVICE_GRANT,
    device_code: deviceCode,
    client_id: CLOUD_CLIENT_ID,
  });
  if (data?.access_token) return data as DeviceTokenResult;

  const code = errorCode(error);
  if (code === "authorization_pending") throw new DevicePendingError(false);
  if (code === "slow_down") throw new DevicePendingError(true);
  if (code === "access_denied")
    throw new DeviceFlowError(code, "Sign-in was denied.");
  if (code === "expired_token") {
    throw new DeviceFlowError(
      code,
      "Sign-in request expired. Please try again.",
    );
  }
  throw new DeviceFlowError(
    code ?? "unknown",
    errorMessage(error, "Sign-in failed"),
  );
}
