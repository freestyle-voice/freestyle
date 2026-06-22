/**
 * Shared parsing for the app-context JSON the client sends with each dictation
 * (the frontmost app/window/url captured at record time). Both the rewrite
 * context matcher and the plugin pipeline read this same payload, so the shape
 * and parse live in one place to keep them from diverging.
 */

export interface AppContextPayload {
  app?: string;
  url?: string;
  title?: string;
  windowTitle?: string;
  bundleId?: string;
}

/** Parse the raw JSON payload, returning `null` when missing or malformed. */
export function parseAppContextPayload(
  raw: string | null,
): AppContextPayload | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AppContextPayload;
  } catch {
    return null;
  }
}
