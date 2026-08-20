import type { RemixContext } from "@freestyle-voice/validations";

/**
 * Mobile has no desktop-style selection or frontmost-window permissions. Keep
 * that limitation explicit in the context the cloud agent receives.
 */
export function createMobileRemixContext(
  languages: string[],
  capturedAt = Date.now(),
): RemixContext {
  return {
    selection: null,
    appName: null,
    windowTitle: null,
    languages,
    capturedAt,
  };
}
