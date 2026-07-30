/**
 * Cloud sync for cleanup preferences (member-scoped).
 *
 * The desktop stores cleanup preferences in the local SQLite `settings` table.
 * This module bridges those local keys to the cloud `GET/PUT /preferences`
 * endpoint so a signed-in user's preferences follow them across devices:
 *
 *   - **pull on launch / sign-in** — {@link pullCloudPreferences} fetches the
 *     cloud snapshot and seeds the local `settings` table. The cloud is the
 *     cross-device seed; a local change made while offline is overwritten on
 *     the next pull (last-write-wins by the cloud's `updatedAt`).
 *   - **push on change** — {@link pushSettingToCloud} maps a single changed
 *     settings key to a partial `PUT /preferences`. Fire-and-forget: any error
 *     is swallowed so a failed sync never disrupts the local write.
 *
 * Cleanup tones/intensity/appAssignments/language are mirrored into the local
 * `settings` table (see FIELD_MAP). Vocabulary lives in a separate SQLite
 * `vocabulary` table, so it is pulled separately via
 * {@link mergeCloudVocabularyTerms} — additively (cloud → local, never deletes
 * local terms). System fragments are computed per request and never persisted,
 * so they remain out of scope for this bridge.
 */

import { createAppLogger } from "@freestyle-voice/utils";
import type { MemberPreferencesInput } from "@freestyle-voice/validations";
import { writeSetting } from "./db.js";
import {
  FreestyleCloudRequestError,
  getCloudPreferences,
  putCloudPreferences,
} from "./freestyle-cloud.js";
import { getSessionToken } from "./sessions.js";
import { mergeCloudVocabularyTerms } from "./vocabulary.js";

const log = createAppLogger("preferences-sync");

/**
 * Mapping between a local settings key and the cloud preference field it maps
 * to. `kind` decides how the value is (de)serialized between the string-valued
 * settings table and the typed cloud payload.
 *
 * The setting-key strings mirror the electron `SETTINGS_KEYS` constants (the
 * server can't import from the renderer package, and the settings route already
 * uses these same string literals).
 */
interface FieldMap {
  settingKey: string;
  cloudField: keyof MemberPreferencesInput;
  kind: "string" | "json";
}

const FIELD_MAP: FieldMap[] = [
  { settingKey: "cleanup_intensity", cloudField: "intensity", kind: "string" },
  {
    settingKey: "cleanup_custom_prompt",
    cloudField: "customPrompt",
    kind: "string",
  },
  {
    settingKey: "cleanup_personal_tone",
    cloudField: "personalTone",
    kind: "string",
  },
  { settingKey: "cleanup_work_tone", cloudField: "workTone", kind: "string" },
  { settingKey: "cleanup_email_tone", cloudField: "emailTone", kind: "string" },
  {
    settingKey: "cleanup_overall_tone",
    cloudField: "overallTone",
    kind: "string",
  },
  {
    settingKey: "cleanup_app_assignments",
    cloudField: "appAssignments",
    kind: "json",
  },
  { settingKey: "language", cloudField: "language", kind: "string" },
];

/** The local settings keys that participate in cloud preference sync. */
export const SYNCED_SETTING_KEYS: ReadonlySet<string> = new Set(
  FIELD_MAP.map((f) => f.settingKey),
);

/**
 * Seed the local `settings` table from the cloud snapshot. Called on launch and
 * right after sign-in. Never throws — a failed pull leaves local settings as-is.
 *
 * Returns `true` when at least one field was applied from the cloud snapshot,
 * `false` otherwise (signed out, offline, no active org, or an empty snapshot).
 */
export async function pullCloudPreferences(): Promise<boolean> {
  const token = getSessionToken();
  if (!token) return false;

  let remote: MemberPreferencesInput;
  try {
    remote = await getCloudPreferences(token);
  } catch (err) {
    // 400 = user has no active org yet; anything else = transient/offline.
    // Either way, keep local settings and move on.
    if (!(err instanceof FreestyleCloudRequestError)) {
      log.debug(
        `Preferences pull skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    return false;
  }

  let applied = false;
  for (const field of FIELD_MAP) {
    const value = remote[field.cloudField];
    // `undefined` = not present in the cloud snapshot -> leave local as-is.
    // `null` = explicitly cleared upstream -> mirror by removing local override.
    if (value === undefined) continue;
    if (value === null) {
      writeSetting(field.settingKey, "");
      applied = true;
      continue;
    }
    const serialized =
      field.kind === "json" ? JSON.stringify(value) : String(value);
    writeSetting(field.settingKey, serialized);
    applied = true;
  }

  // Vocabulary lives in its own SQLite `vocabulary` table (not `settings`), so
  // it's handled outside FIELD_MAP. Merge cloud-seeded terms into the local
  // table additively. Folding the result into `applied` matters:
  // pullCloudPreferencesWithRetry() stops once a pull returns `true`, so a pull
  // that seeds ONLY vocabulary (no tone changes) must still count as applied.
  if (remote.vocabulary && Array.isArray(remote.vocabulary.terms)) {
    const inserted = mergeCloudVocabularyTerms(remote.vocabulary.terms);
    if (inserted > 0) applied = true;
  }

  if (applied) log.info("Cleanup preferences pulled from Freestyle Cloud");
  return applied;
}

/** Delay between preference-pull retries, in milliseconds. */
const PULL_RETRY_DELAY_MS = 400;

/**
 * Pull cloud preferences, retrying a few times until something is applied.
 *
 * Used right after a first-time industry set: the cloud seeds the member's
 * `member_preferences` row asynchronously (fire-and-forget, after its profile
 * response returns), so an immediate pull can race the seed. We retry with a
 * short backoff so the seeded tones/vocabulary land locally without the user
 * waiting for the next launch. Stops as soon as a pull applies a value, or
 * after `attempts` tries. Never throws.
 */
export async function pullCloudPreferencesWithRetry(
  attempts = 3,
): Promise<boolean> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) {
      await new Promise((resolve) => setTimeout(resolve, PULL_RETRY_DELAY_MS));
    }
    if (await pullCloudPreferences()) return true;
  }
  return false;
}

/**
 * Push a single changed settings key to the cloud as a partial patch. No-op for
 * keys that are not synced or when signed out. Fire-and-forget: errors are
 * swallowed so a failed sync never disrupts the local write.
 */
export async function pushSettingToCloud(
  key: string,
  value: string,
): Promise<void> {
  const field = FIELD_MAP.find((f) => f.settingKey === key);
  if (!field) return;

  const token = getSessionToken();
  if (!token) return;

  const patch: MemberPreferencesInput = {};
  if (field.kind === "json") {
    try {
      (patch as Record<string, unknown>)[field.cloudField] = value
        ? JSON.parse(value)
        : null;
    } catch {
      // Malformed local JSON — don't push garbage upstream.
      return;
    }
  } else {
    (patch as Record<string, unknown>)[field.cloudField] =
      value === "" ? null : value;
  }

  try {
    await putCloudPreferences(token, patch);
  } catch (err) {
    log.debug(
      `Preferences push skipped for ${key}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
