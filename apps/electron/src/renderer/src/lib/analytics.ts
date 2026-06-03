import { getApiBase } from "@renderer/lib/api";

// ---------------------------------------------------------------------------
// Onboarding analytics
//
// These events power a drop-off funnel in PostHog (started → permissions →
// model → completed) so we can see where people stall.
//
// They're sent to the server's `POST /api/telemetry`, which forwards to the
// same `capture()` in apps/server/src/lib/posthog.ts that every other product
// event uses. Routing through the server (rather than firing posthog-js from
// the renderer) keeps a single capture path that honors the telemetry opt-out
// (`telemetry_enabled` + `DO_NOT_TRACK`), only emits in production, and
// attributes to the same device id.
//
// Core funnel milestones (ordered):
//   1. onboarding_started
//   2. onboarding_permissions_completed
//   3. onboarding_model_completed
//   4. onboarding_completed
// The remaining events are finer-grained actions for diagnosing *why* a step
// is lost (e.g. a model download that never finishes).
// ---------------------------------------------------------------------------

export type OnboardingEvent =
  | "onboarding_started"
  | "onboarding_step_viewed"
  | "onboarding_mic_permission_clicked"
  | "onboarding_mic_granted"
  | "onboarding_accessibility_clicked"
  | "onboarding_accessibility_granted"
  | "onboarding_permissions_completed"
  | "onboarding_model_download_clicked"
  | "onboarding_model_download_completed"
  | "onboarding_model_download_failed"
  | "onboarding_model_selector_opened"
  | "onboarding_model_selector_source_changed"
  | "onboarding_model_selected"
  | "onboarding_cloud_key_entry_viewed"
  | "onboarding_cloud_key_saved"
  | "onboarding_model_back_clicked"
  | "onboarding_model_completed"
  | "onboarding_hotkey_change_started"
  | "onboarding_hotkey_changed"
  | "onboarding_dictation_tried"
  | "onboarding_tutorial_back_clicked"
  | "onboarding_completed";

/**
 * Fire-and-forget onboarding analytics. Best-effort: failures never interrupt
 * the flow, and the server decides whether the event is actually recorded
 * (production + telemetry enabled).
 */
export function trackOnboarding(
  event: OnboardingEvent,
  properties?: Record<string, unknown>,
): void {
  try {
    fetch(`${getApiBase()}/api/telemetry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, properties }),
      // Survive the renderer navigating away when onboarding completes.
      keepalive: true,
    }).catch(() => {});
  } catch {
    // analytics is best-effort — swallow everything
  }
}
