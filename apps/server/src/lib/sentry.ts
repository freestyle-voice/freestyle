import * as Sentry from "@sentry/node";

let initialized = false;

export function initSentry(): void {
  if (initialized) return;
  initialized = true;

  // When running inside Electron, @sentry/electron/main already initialises
  // the SDK for the main process. Calling @sentry/node init() a second time
  // would overwrite the electron client, so we skip it here.
  if (process.versions.electron) return;

  const dsn =
    process.env.SENTRY_DSN ||
    "https://feebe227ccceae0fc8744ae07ac463be@o4509750817325057.ingest.us.sentry.io/4511446234562560";

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV || "development",
    enabled: process.env.NODE_ENV === "production",
    tracesSampleRate: 1.0,
  });
}

export function captureException(err: unknown): void {
  Sentry.captureException(err);
}

export const metrics = Sentry.metrics;

export { Sentry };
