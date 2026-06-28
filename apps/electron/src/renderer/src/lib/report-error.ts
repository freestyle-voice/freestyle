import { getApiBase } from "@renderer/lib/api";

/**
 * Report a renderer-side error to the server, which always persists it to the
 * local diagnostic log file and (if telemetry is enabled) forwards it to
 * PostHog. Fire-and-forget — reporting must never interrupt the UI.
 *
 * Only the message, stack, and a small structured `context` are sent. Never
 * pass transcript text, clipboard content, or other PII as context.
 */
export function reportError(
  error: unknown,
  context?: Record<string, unknown>,
): void {
  try {
    const err = error instanceof Error ? error : new Error(String(error));
    fetch(`${getApiBase()}/api/client-error`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: err.message || "Unknown error",
        stack: err.stack,
        source: "renderer",
        context,
      }),
      // Survive the window navigating/closing right after a crash.
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Error reporting is best-effort — swallow everything.
  }
}

/**
 * Install global listeners that funnel uncaught errors and unhandled promise
 * rejections in this renderer window into {@link reportError}. Call once at
 * window bootstrap.
 */
export function installGlobalErrorHandlers(): void {
  window.addEventListener("error", (event) => {
    reportError(event.error ?? new Error(event.message), {
      kind: "window.onerror",
    });
  });
  window.addEventListener("unhandledrejection", (event) => {
    reportError(event.reason ?? new Error("Unhandled promise rejection"), {
      kind: "unhandledrejection",
    });
  });
}
