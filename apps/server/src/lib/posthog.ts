import crypto from "node:crypto";
import { PostHog } from "posthog-node";
import { getDb } from "./db.js";

let _client: PostHog | null = null;

const POSTHOG_API_KEY = "phc_mDhFafyLK3Safsrrehi7rnH2X9jVMMGNAwKWuJsEN54w";
const POSTHOG_HOST = "https://us.i.posthog.com";

function getEnvironment(): string {
  return process.env.FREESTYLE_ENV === "production"
    ? "production"
    : "development";
}

function isEnabled(): boolean {
  if (process.env.DO_NOT_TRACK === "1") return false;
  const devOptIn = process.env.FREESTYLE_ANALYTICS_DEV === "1";
  if (getEnvironment() !== "production" && !devOptIn) return false;

  try {
    const db = getDb();
    const row = db
      .prepare("SELECT value FROM settings WHERE key = 'telemetry_enabled'")
      .get() as { value: string } | undefined;
    if (row?.value === "false") return false;
  } catch {
    // DB not ready yet — default to enabled
  }

  return true;
}

function getClient(): PostHog {
  if (_client) return _client;

  _client = new PostHog(POSTHOG_API_KEY, {
    host: POSTHOG_HOST,
    enableExceptionAutocapture: true,
  });
  return _client;
}

let _deviceId: string | null = null;

export function getDeviceId(): string {
  if (_deviceId) return _deviceId;

  try {
    const db = getDb();
    const row = db
      .prepare("SELECT value FROM settings WHERE key = 'posthog_device_id'")
      .get() as { value: string } | undefined;

    if (row?.value) {
      _deviceId = row.value;
      return _deviceId;
    }

    const newId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    ).run("posthog_device_id", newId);
    _deviceId = newId;
    return _deviceId;
  } catch {
    if (!_deviceId) _deviceId = crypto.randomUUID();
    return _deviceId;
  }
}

export function capture(
  event: string,
  properties?: Record<string, unknown>,
): void {
  try {
    if (!isEnabled()) return;
    getClient().capture({
      distinctId: getDeviceId(),
      event,
      properties: { ...properties, environment: getEnvironment() },
    });
  } catch {
    // Never let analytics errors affect the app
  }
}

export function captureException(
  error: unknown,
  additionalProperties?: Record<string, unknown>,
): void {
  try {
    if (!isEnabled()) return;
    getClient().captureException(error, getDeviceId(), {
      ...additionalProperties,
      environment: getEnvironment(),
    });
  } catch {
    // Never let analytics errors affect the app
  }
}

export async function shutdownPosthog(): Promise<void> {
  if (_client) {
    await _client.shutdown();
    _client = null;
  }
}
