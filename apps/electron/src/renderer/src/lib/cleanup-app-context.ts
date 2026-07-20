import {
  areAllCleanupTonesOff,
  parseCleanupEmailTone,
  parseCleanupOverallTone,
  parseCleanupPersonalTone,
  parseCleanupWorkTone,
} from "@freestyle-voice/validations";
import { SETTINGS_KEYS } from "../../../shared/settings-keys";
import { getClient } from "./api";

let cachedNeedsAppContext: boolean | null = null;

/**
 * Derive (and cache) whether we should capture the frontmost app for
 * destination routing from an already-loaded settings snapshot. Lets callers
 * that have just fetched `/api/settings` avoid a second round-trip.
 */
export function applyNeedsAppContextForCleanup(
  settings: Record<string, string>,
): boolean {
  if (settings[SETTINGS_KEYS.llmCleanup] !== "true") {
    cachedNeedsAppContext = false;
    return false;
  }

  cachedNeedsAppContext = !areAllCleanupTonesOff({
    personalTone: parseCleanupPersonalTone(
      settings[SETTINGS_KEYS.cleanupPersonalTone],
    ),
    workTone: parseCleanupWorkTone(settings[SETTINGS_KEYS.cleanupWorkTone]),
    emailTone: parseCleanupEmailTone(settings[SETTINGS_KEYS.cleanupEmailTone]),
    overallTone: parseCleanupOverallTone(
      settings[SETTINGS_KEYS.cleanupOverallTone],
    ),
  });
  return cachedNeedsAppContext;
}

/**
 * Re-read cleanup tone settings and cache whether we should capture the
 * frontmost app for destination routing.
 */
export async function refreshNeedsAppContextForCleanup(): Promise<boolean> {
  try {
    const res = await getClient().api.settings.$get();
    if (!res.ok) {
      return cachedNeedsAppContext ?? true;
    }

    return applyNeedsAppContextForCleanup(await res.json());
  } catch {
    return cachedNeedsAppContext ?? true;
  }
}
