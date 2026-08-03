/**
 * Clearing device-local, account-scoped cloud state on sign-out.
 *
 * The mobile app is cloud-only (no signed-out dictation), so member preferences
 * and vocabulary are always re-pulled from the cloud on the next sign-in. That
 * makes it safe — and necessary — to wipe the locally-cached copies on sign-out:
 * otherwise a DIFFERENT account signing in on the same device would inherit the
 * previous account's tones/languages/vocabulary (the providers re-hydrate from
 * AsyncStorage on mount) and the backfill would push them up into the new
 * account's cloud (a cross-account leak). Wiping is lossless for the SAME
 * account too, since the cloud is authoritative and re-seeds on sign-in.
 */

import { queryClient } from "../query";
import { removePrefs } from "../storage";

/**
 * AsyncStorage preference keys that mirror cloud member_preferences (so they're
 * re-pullable and safe to wipe). Keep in sync with the synced keys in
 * `settings.tsx` (languages + cleanup tones) and `entries.tsx` (vocabulary).
 * Device-only keys (`cleanup` toggle) and local-only content that the cloud
 * never stores (`dictionary`, `history`) are intentionally excluded — wiping
 * those would be lossy, not a leak fix.
 */
const CLOUD_SYNCED_PREF_KEYS = [
  "languages",
  "language", // legacy singular, migrated on read
  "cleanup_intensity",
  "cleanup_custom_prompt",
  "cleanup_personal_tone",
  "cleanup_work_tone",
  "cleanup_email_tone",
  "cleanup_overall_tone",
  "vocabulary",
] as const;

/**
 * Drop the previous account's cloud-scoped React Query cache and the locally
 * cached synced preferences/vocabulary. Call on sign-out so the next account
 * starts from its own cloud snapshot instead of inheriting these.
 */
export async function clearCloudScopedLocalCache(): Promise<void> {
  // Cloud-scoped queries follow a `cloud-` key prefix by convention.
  queryClient.removeQueries({
    predicate: (query) => {
      const first = query.queryKey[0];
      return typeof first === "string" && first.startsWith("cloud-");
    },
  });
  await removePrefs([...CLOUD_SYNCED_PREF_KEYS]);
}
