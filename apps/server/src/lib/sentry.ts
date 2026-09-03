import * as Sentry from "@sentry/node";
import { getDb } from "./db.js";

const SERVER_DSN =
  "https://feebe227ccceae0fc8744ae07ac463be@o4509750817325057.ingest.us.sentry.io/4511446234562560";

function getEnvironment(): string {
  return process.env.FREESTYLE_ENV === "production" ||
    process.env.NODE_ENV === "production"
    ? "production"
    : "development";
}

let telemetryOptedOut: boolean | null = null;
let onTelemetrySettingChanged: (() => void) | undefined;

function isTelemetryOptedOut(): boolean {
  if (telemetryOptedOut !== null) return telemetryOptedOut;
  try {
    const row = getDb()
      .prepare("SELECT value FROM settings WHERE key = 'telemetry_enabled'")
      .get() as { value: string } | undefined;
    telemetryOptedOut = row?.value === "false";
  } catch {
    // The database is not ready during process startup. Re-check on the next
    // event instead of dropping startup diagnostics.
    return false;
  }
  return telemetryOptedOut;
}

/** Re-read the existing telemetry preference after a settings change. */
export function invalidateTelemetrySetting(): void {
  telemetryOptedOut = null;
  onTelemetrySettingChanged?.();
}

/**
 * Update the active SDK client after the user changes the telemetry setting.
 * Electron registers its main-process client; standalone server uses the Node
 * client initialized below.
 */
export function setTelemetrySettingChangeHandler(
  handler: (() => void) | undefined,
): void {
  onTelemetrySettingChanged = handler;
}

export function isTelemetryEnabled(): boolean {
  if (process.env.DO_NOT_TRACK === "1") return false;
  const devOptIn = process.env.FREESTYLE_ANALYTICS_DEV === "1";
  if (getEnvironment() !== "production" && !devOptIn) return false;
  return !isTelemetryOptedOut();
}

function dropWhenDisabled<T>(event: T): T | null {
  return isTelemetryEnabled() ? event : null;
}

/**
 * Initialize Sentry for the standalone server. In Electron the main-process
 * SDK owns initialization so both the app and embedded server share one client.
 */
export function initSentry(): void {
  if (process.versions.electron) return;

  Sentry.init({
    dsn: process.env.SENTRY_DSN ?? SERVER_DSN,
    environment: getEnvironment(),
    release: process.env.FREESTYLE_APP_VERSION,
    // This adapter deliberately sends only our explicit errors, product logs,
    // and custom product metrics. Disabling automatic instrumentation keeps
    // opt-out comprehensive and avoids collecting latency-sensitive server
    // activity by default.
    defaultIntegrations: false,
    skipOpenTelemetrySetup: true,
    tracesSampleRate: 0,
    enableLogs: true,
    enableMetrics: true,
    sendDefaultPii: false,
    enabled: isTelemetryEnabled(),
    beforeSend: dropWhenDisabled,
    beforeSendTransaction: dropWhenDisabled,
    beforeSendLog: dropWhenDisabled,
  });
  setTelemetrySettingChangeHandler(() => {
    const client = Sentry.getClient();
    if (client) client.getOptions().enabled = isTelemetryEnabled();
  });
}

export interface CloudIdentity {
  id: string;
}

let currentUser: CloudIdentity | null = null;
let userProperties: Record<string, unknown> = {};

function applyUser(): void {
  if (!currentUser) return;
  Sentry.setUser({
    id: currentUser.id,
    ...(Object.keys(userProperties).length > 0 ? { data: userProperties } : {}),
  });
}

/** Attach the opaque signed-in account ID to subsequent Sentry diagnostics. */
export function identifyCloudUser(user: CloudIdentity): void {
  currentUser = user;
  userProperties = {};
  if (!isTelemetryEnabled()) return;
  try {
    applyUser();
  } catch {
    // Observability must never change authentication behavior.
  }
}

/** Record durable account properties on the current Sentry user scope. */
export function setPersonProperties(properties: Record<string, unknown>): void {
  userProperties = { ...userProperties, ...properties };
  if (!isTelemetryEnabled()) return;
  try {
    applyUser();
  } catch {
    // Observability must never interrupt the product flow.
  }
}

/** Attach scalar application properties to subsequent Sentry diagnostics. */
export function registerSuperProperties(
  properties: Record<string, string | number | boolean>,
): void {
  if (!isTelemetryEnabled()) return;
  try {
    Sentry.setTags(properties);
  } catch {
    // Observability must never interrupt the product flow.
  }
}

export function resetCloudIdentity(): void {
  currentUser = null;
  userProperties = {};
  try {
    Sentry.setUser(null);
  } catch {
    // Observability must never interrupt sign-out.
  }
}

/** Remove the anonymous identifier used by the retired telemetry provider. */
export function removeLegacyTelemetryIdentity(): void {
  try {
    getDb()
      .prepare("DELETE FROM settings WHERE key = ?")
      .run("posthog_device_id");
  } catch {
    // Cleanup is best-effort and must not block app startup.
  }
}

/**
 * Product events are structured Sentry logs plus bounded custom metrics rather
 * than issue-generating messages. Keep payloads metadata-only: never pass
 * transcript or clipboard content to this function.
 */
export function capture(
  event: string,
  properties?: Record<string, unknown>,
): void {
  if (!isTelemetryEnabled()) return;
  try {
    Sentry.logger.info(event, properties);
    Sentry.metrics.count("freestyle.product_event", 1, {
      attributes: { "event.name": event },
    });
    const durationMs = properties?.duration_ms;
    if (typeof durationMs === "number" && Number.isFinite(durationMs)) {
      Sentry.metrics.distribution(
        "freestyle.product_event.duration",
        durationMs,
        {
          unit: "millisecond",
          attributes: { "event.name": event },
        },
      );
    }
  } catch {
    // Logging must never alter product behavior.
  }
}

export function captureException(
  error: unknown,
  additionalProperties?: Record<string, unknown>,
): void {
  if (!isTelemetryEnabled()) return;
  try {
    Sentry.captureException(error, { extra: additionalProperties });
  } catch {
    // Reporting must never mask the original failure.
  }
}

export async function shutdownSentry(): Promise<void> {
  await Sentry.close(2_000);
}
