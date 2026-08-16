import { apiFetch } from "@renderer/lib/api";
import { reportSuggestion } from "@renderer/lib/openers";

/**
 * Capture a PostHog event from the renderer.
 *
 * Events are POSTed to the server's `/api/telemetry`, which forwards to the
 * same server-side `capture()` (apps/server/src/lib/posthog.ts) that every
 * other product event uses. Routing through the server keeps a single capture
 * path that honors the telemetry opt-out (`telemetry_enabled` +
 * `DO_NOT_TRACK`), only emits in production (or with FREESTYLE_ANALYTICS_DEV=1),
 * and attributes to the same device id — the renderer ships no PostHog SDK.
 *
 * Fire-and-forget: failures never interrupt the UI.
 */
export type SuggestionSurface = "opener" | "chat_connect" | "capability";

export function captureSuggestion(
  phase: "shown" | "accepted" | "dismissed",
  surface: SuggestionSurface,
  properties?: Record<string, unknown>,
): void {
  capture(`suggestion_${phase}`, { surface, ...properties });
  // Connect cards are the same offer whether they came from the openers or
  // from chat, so both report under connect:<slug> and retire together.
  const slug = properties?.slug;
  const id =
    typeof slug === "string" ? `connect:${slug}` : (properties?.id ?? null);
  if (phase !== "shown" && typeof id === "string") {
    reportSuggestion(id, surface, phase);
  }
}

export function capture(
  event: string,
  properties?: Record<string, unknown>,
): void {
  try {
    apiFetch("/api/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, properties }),
      // Survive the renderer navigating away (e.g. when onboarding completes).
      keepalive: true,
    }).catch(() => {});
  } catch {
    // analytics is best-effort — swallow everything
  }
}
