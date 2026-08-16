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

// Cached `telemetry_enabled` setting. `isEnabled()` is called on every
// `capture()`/`captureException()` — multiple times per dictation — so we read
// the DB once and reuse the value. Invalidated via `invalidateTelemetrySetting`
// whenever the setting is written or deleted.
let _telemetryOptedOut: boolean | null = null;

function isTelemetryOptedOut(): boolean {
  if (_telemetryOptedOut !== null) return _telemetryOptedOut;
  try {
    const row = getDb()
      .prepare("SELECT value FROM settings WHERE key = 'telemetry_enabled'")
      .get() as { value: string } | undefined;
    _telemetryOptedOut = row?.value === "false";
  } catch {
    // DB not ready yet — treat as opted-in and re-read next time.
    return false;
  }
  return _telemetryOptedOut;
}

/** Drop the cached `telemetry_enabled` value so the next check re-reads it. */
export function invalidateTelemetrySetting(): void {
  _telemetryOptedOut = null;
}

function isEnabled(): boolean {
  if (process.env.DO_NOT_TRACK === "1") return false;
  const devOptIn = process.env.FREESTYLE_ANALYTICS_DEV === "1";
  if (getEnvironment() !== "production" && !devOptIn) return false;

  return !isTelemetryOptedOut();
}

function getClient(): PostHog {
  if (_client) return _client;

  _client = new PostHog(POSTHOG_API_KEY, {
    host: POSTHOG_HOST,
    enableExceptionAutocapture: true,
  });
  // Super properties: attached to every event for the client's lifetime
  // (manual capture, captureException, and autocaptured exceptions), so each
  // event records the release and environment it came from. Event-level
  // properties still override these.
  _client.register({
    app_version: process.env.FREESTYLE_APP_VERSION ?? "unknown",
    environment: getEnvironment(),
    os: process.platform,
  });
  return _client;
}

let _deviceId: string | null = null;

const DEVICE_ID_KEY = "posthog_device_id";
const LINKED_USER_KEY = "posthog_linked_user_id";

function readSetting(key: string): string | null {
  try {
    const row = getDb()
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get(key) as { value: string } | undefined;
    return row?.value ?? null;
  } catch {
    return null;
  }
}

function writeSetting(key: string, value: string): void {
  try {
    getDb()
      .prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
      )
      .run(key, value);
  } catch {
    // Analytics bookkeeping must never break the app.
  }
}

/**
 * Start a fresh anonymous identity for this machine.
 *
 * Called when a different account signs in. The device id is the anonymous
 * handle we link to a user, so reusing it across accounts would weld two
 * people into one PostHog person.
 */
export function rotateDeviceId(): string {
  const next = crypto.randomUUID();
  _deviceId = next;
  writeSetting(DEVICE_ID_KEY, next);
  return next;
}

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

let _userDistinctId: string | null = null;

function activeDistinctId(): string {
  return _userDistinctId ?? getDeviceId();
}

export interface CloudIdentity {
  id: string;
  email: string;
  name?: string | null;
}

/**
 * Bind this process's events to a cloud user.
 *
 * Must run on every launch that has a session, not only at sign-in: without it
 * `activeDistinctId()` falls back to the device id while the Worker attributes
 * the same person to `user.id`, and the two halves of a retention chart stop
 * describing the same population.
 *
 * The anonymous handle is linked forward exactly once per account. A different
 * account on the same machine rotates the device id first, so the previous
 * user's anonymous history is never merged into the new one.
 */
export function identifyCloudUser(user: CloudIdentity): void {
  _userDistinctId = user.id;
  try {
    const linked = readSetting(LINKED_USER_KEY);
    const isFirstLink = linked === null;
    const isAccountSwitch = linked !== null && linked !== user.id;

    if (isAccountSwitch) rotateDeviceId();
    if (linked !== user.id) writeSetting(LINKED_USER_KEY, user.id);

    if (!isEnabled()) return;
    getClient().identify({
      distinctId: user.id,
      // $anon_distinct_id is the supported replacement for alias(): it merges
      // the pre-sign-in device person into this user, once.
      ...(isFirstLink
        ? { properties: { $anon_distinct_id: getDeviceId() } }
        : {}),
    });
    setPersonProperties({
      email: user.email,
      ...(user.name ? { name: user.name } : {}),
    });
  } catch {
    // Never let analytics errors affect the app
  }
}

/**
 * Durable traits on the person, not the event. Safe to call repeatedly; only
 * send values that actually changed.
 */
export function setPersonProperties(properties: Record<string, unknown>): void {
  try {
    if (!isEnabled()) return;
    getClient().capture({
      distinctId: activeDistinctId(),
      event: "$set",
      properties: { $set: properties },
    });
  } catch {
    // Never let analytics errors affect the app
  }
}

/** Attach a property to every subsequent event from this process. */
export function registerSuperProperties(
  properties: Record<string, string | number | boolean>,
): void {
  try {
    if (!isEnabled()) return;
    getClient().register(properties);
  } catch {
    // Never let analytics errors affect the app
  }
}

export function resetCloudIdentity(): void {
  _userDistinctId = null;
}

export function capture(
  event: string,
  properties?: Record<string, unknown>,
): void {
  try {
    if (!isEnabled()) return;
    getClient().capture({
      distinctId: activeDistinctId(),
      event,
      properties,
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
    getClient().captureException(
      error,
      activeDistinctId(),
      additionalProperties,
    );
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
