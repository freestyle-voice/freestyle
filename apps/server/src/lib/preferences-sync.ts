/**
 * Cloud sync for cleanup preferences (member-scoped).
 *
 * The desktop stores cleanup preferences in the local SQLite `settings` table.
 * This module bridges those local keys to the cloud `GET/PUT /{org}/member/preferences`
 * endpoint so a signed-in user's preferences follow them across devices:
 *
 *   - **pull on launch / sign-in** — {@link pullCloudPreferences} fetches the
 *     cloud snapshot and seeds the local `settings` table. The cloud is the
 *     cross-device seed; a local change made while offline is overwritten on
 *     the next pull (last-write-wins by the cloud's `updatedAt`).
 *   - **push on change** — {@link pushSettingToCloud} maps a single changed
 *     settings key to a partial `PUT /{org}/member/preferences`. Fire-and-forget: any error
 *     is swallowed so a failed sync never disrupts the local write.
 *
 * Cleanup tones/intensity/appAssignments/language are mirrored into the local
 * `settings` table (see FIELD_MAP). Vocabulary lives in a separate SQLite
 * `vocabulary` table, so it syncs separately but two-way:
 *
 *   - **pull** — {@link mirrorCloudVocabularyTerms} makes the local table an
 *     exact mirror of the cloud's canonical term set (adds + deletes), while
 *     preserving local-only notes on surviving terms.
 *   - **push** — {@link pushVocabularyToCloud} sends the full local term list up
 *     (debounced). The cloud replaces its stored `terms` array wholesale, so a
 *     local delete propagates and won't be re-seeded on the next pull.
 *
 * System fragments are computed per request and never persisted, so they remain
 * out of scope for this bridge.
 */

import { createAppLogger } from "@freestyle-voice/utils";
import type { MemberPreferencesInput } from "@freestyle-voice/validations";
import { deleteSetting, readSetting, writeSetting } from "./db.js";
import {
  FreestyleCloudRequestError,
  getCloudPreferences,
  resolveActiveOrgSlug,
} from "./freestyle-cloud.js";
import { getSessionToken } from "./sessions.js";
import { enqueueOutbox, pendingOutboxFields } from "./sync-outbox.js";
import {
  clearVocabulary,
  loadVocabularyTerms,
  mirrorCloudVocabularyTerms,
} from "./vocabulary.js";

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
  // Transcription languages: a JSON array of ISO codes. The cloud replaces the
  // array wholesale on push and returns it as-is on pull.
  { settingKey: "languages", cloudField: "languages", kind: "json" },
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
    const orgSlug = await resolveActiveOrgSlug(token);
    if (!orgSlug) return false; // no active org yet — nothing to pull
    remote = await getCloudPreferences(token, orgSlug);
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

  const pending = pendingOutboxFields();
  let applied = false;
  for (const field of FIELD_MAP) {
    if (pending.has(field.cloudField)) continue;
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
  // it's handled outside FIELD_MAP. Mirror the cloud's canonical term set into
  // the local table (adds + deletes), preserving local-only notes. Folding the
  // result into `applied` matters: pullCloudPreferencesWithRetry() stops once a
  // pull returns `true`, so a pull that changes ONLY vocabulary (no tone
  // changes) must still count as applied.
  //
  // Only mirror when the cloud snapshot actually carries a `vocabulary` object.
  // `undefined` means "nothing synced yet" — mirroring an absent set would wipe
  // all local terms, so we skip it and leave the local table untouched. An
  // explicit empty `terms: []` DOES mirror (the user cleared their list on
  // another device).
  if (
    !pending.has("vocabulary") &&
    remote.vocabulary &&
    Array.isArray(remote.vocabulary.terms)
  ) {
    const changed = mirrorCloudVocabularyTerms(remote.vocabulary.terms);
    if (changed > 0) applied = true;
  }

  // One-time: seed the cloud with any synced field it's still missing from the
  // local settings. Uses the snapshot we just fetched (consistent view, no
  // extra request) and is guarded so it runs once per account per device.
  backfillMissingCloudPreferences(remote);

  if (applied) log.info("Cleanup preferences pulled from Freestyle Cloud");
  return applied;
}

/**
 * Local flag marking that the one-time preference backfill has run for the
 * current account on this device. Written directly to the `settings` table (so
 * it never triggers a cloud push) and cleared on sign-out via
 * {@link resetPreferencesBackfill} so a different account signing in on the same
 * device backfills its own snapshot.
 */
const CLOUD_PREFS_BACKFILLED_KEY = "cloud_prefs_backfilled";

/**
 * One-time backfill of the cloud `member_preferences` row from local settings.
 *
 * Pre-cloud-sync clients never pushed their EXISTING local preferences up — a
 * value only syncs when it later changes (see {@link pushSettingToCloud}). Now
 * that clients no longer send cleanup preferences inline with each request (the
 * cloud reads them from `member_preferences`), any field the cloud is missing
 * would silently fall back to the built-in default. This closes that gap: the
 * first time we successfully read the cloud snapshot, for every synced field the
 * snapshot doesn't carry (`undefined`) but that IS set locally, enqueue a patch
 * to seed it upstream.
 *
 *   - Only fields ABSENT upstream are pushed — a value the cloud already has (an
 *     explicit value OR a `null` clear) wins, since the pull just applied it to
 *     local; we never clobber it.
 *   - Empty JSON arrays (`languages`/`appAssignments`) are skipped — an empty
 *     selection is indistinguishable from "unset" and seeds nothing useful.
 *   - Runs once per account per device (guarded by a persisted flag). The flag
 *     is set after the first snapshot read regardless of whether anything was
 *     pushed, so steady-state launches don't re-diff.
 *   - Fire-and-forget via the durable outbox — a failed/offline push is retried
 *     and never disrupts anything.
 *
 * `remote` is the snapshot the surrounding pull just applied, so the diff is
 * against exactly what the cloud returned.
 */
function backfillMissingCloudPreferences(remote: MemberPreferencesInput): void {
  if (readSetting(CLOUD_PREFS_BACKFILLED_KEY) === "1") return;
  if (!getSessionToken()) return;

  for (const field of FIELD_MAP) {
    // Cloud already has this field — don't overwrite what the pull just applied.
    if (remote[field.cloudField] !== undefined) continue;
    const local = readSetting(field.settingKey);
    if (local == null || local === "") continue; // nothing local to seed

    let value: unknown;
    if (field.kind === "json") {
      try {
        value = JSON.parse(local);
      } catch {
        continue; // malformed local JSON — skip rather than push garbage
      }
      if (Array.isArray(value) && value.length === 0) continue;
    } else {
      value = local;
    }

    // Enqueue under the same key `pushSettingToCloud` uses so a later change to
    // this field supersedes the backfill row (the outbox upserts by cloudField).
    const patch: MemberPreferencesInput = {};
    (patch as Record<string, unknown>)[field.cloudField] = value;
    enqueueOutbox(field.cloudField, patch);
  }

  // Vocabulary lives outside FIELD_MAP. The cloud carries a `vocabulary` object
  // only once terms have been synced; when it's absent and we have local terms,
  // seed them. (When the cloud DOES carry vocabulary, the pull already mirrored
  // it — nothing to backfill.)
  if (!remote.vocabulary || !Array.isArray(remote.vocabulary.terms)) {
    const terms = loadVocabularyTerms();
    if (terms.length > 0)
      enqueueOutbox("vocabulary", { vocabulary: { terms } });
  }

  // Mark done even if nothing was pushed — we've reconciled against a real
  // snapshot, so there's no reason to diff again on every launch.
  writeSetting(CLOUD_PREFS_BACKFILLED_KEY, "1");
}

/**
 * Reset the one-time backfill flag. Called on sign-out so the next account to
 * sign in on this device runs its own backfill against its own cloud snapshot.
 * Best-effort — a failed reset only means the next account skips the backfill.
 */
export function resetPreferencesBackfill(): void {
  try {
    writeSetting(CLOUD_PREFS_BACKFILLED_KEY, "");
  } catch {
    // Non-fatal — see doc comment.
  }
}

/**
 * Local record of which cloud account last seeded the local synced preferences.
 * The `settings`/`vocabulary` tables are device-global (not account-scoped), so
 * this lets a sign-in detect when a DIFFERENT account is taking over the device.
 */
const CLOUD_SYNCED_ACCOUNT_KEY = "cloud_synced_account_id";

/**
 * Scrub the previous account's synced preferences when a different account signs
 * in on this device, then record the new owner.
 *
 * The synced settings keys and the vocabulary table are device-global. Without
 * this, account B signing in after account A would keep A's tones/languages/
 * vocabulary for any field B's cloud snapshot doesn't carry — and, worse, the
 * one-time backfill would then push A's leftover local values UP into B's cloud
 * account (a cross-account data leak). Clearing the local synced state before
 * the sign-in pull means B seeds cleanly from B's own cloud snapshot and the
 * backfill finds nothing stale to push.
 *
 * Called on sign-in (see the device-token route), BEFORE {@link pullCloudPreferences}.
 * Only scrubs on an actual account CHANGE — the same account re-signing in keeps
 * its local state (so its offline edits still backfill), and a first-ever sign-in
 * (no previous owner) keeps the user's pre-sign-in local prefs so they seed the
 * new cloud account.
 */
export function resetSyncedPreferencesForAccount(accountId: string): void {
  const previous = readSetting(CLOUD_SYNCED_ACCOUNT_KEY);
  if (previous && previous !== accountId) {
    for (const field of FIELD_MAP) deleteSetting(field.settingKey);
    clearVocabulary();
    // Re-arm the backfill so it re-evaluates against the (now empty) local state
    // for the new account rather than staying "done" from the previous one.
    writeSetting(CLOUD_PREFS_BACKFILLED_KEY, "");
    log.info("Cleared previous account's synced preferences on account change");
  }
  writeSetting(CLOUD_SYNCED_ACCOUNT_KEY, accountId);
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
 * keys that are not synced or when signed out. Enqueues the patch in the durable
 * outbox (which flushes immediately and retries on failure), so a sync that
 * fails while offline is delivered later rather than lost.
 */
export function pushSettingToCloud(key: string, value: string): void {
  const field = FIELD_MAP.find((f) => f.settingKey === key);
  if (!field) return;

  if (!getSessionToken()) return;

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

  enqueueOutbox(field.cloudField, patch);
}

/**
 * Debounce window for vocabulary pushes. A local edit rarely comes alone — an
 * import inserts many rows and the UI can fire several add/edit/delete calls in
 * quick succession — so we coalesce them into a single PUT that carries the
 * latest full list. Reading the current list at flush time (not enqueue time)
 * means the newest snapshot always wins.
 */
const VOCABULARY_PUSH_DEBOUNCE_MS = 500;
let vocabularyPushTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Enqueue the full local vocabulary term list for durable delivery to the cloud.
 * The cloud REPLACES its stored `terms` array wholesale, so sending the current
 * snapshot is what makes local deletes and edits propagate up. No-op when signed
 * out. Reads the canonical local list at flush time so the newest snapshot wins.
 */
const VOCABULARY_SYNC_LIMIT = 1000;

function flushVocabularyToCloud(): void {
  if (!getSessionToken()) return;
  const terms = loadVocabularyTerms();
  if (terms.length > VOCABULARY_SYNC_LIMIT) {
    log.warn(
      `Vocabulary has ${terms.length} terms; only the first ${VOCABULARY_SYNC_LIMIT} sync to the cloud.`,
    );
  }
  enqueueOutbox("vocabulary", {
    vocabulary: { terms: terms.slice(0, VOCABULARY_SYNC_LIMIT) },
  });
}

/**
 * Schedule a debounced enqueue of the local vocabulary to the cloud. Called from
 * the vocabulary CRUD routes after any mutation (add / update / delete /
 * import). The debounce coalesces a burst of edits in memory; the outbox then
 * makes delivery durable (and retries on failure). Fire-and-forget.
 */
export function pushVocabularyToCloud(): void {
  // No point scheduling work we'll immediately drop.
  if (!getSessionToken()) return;

  if (vocabularyPushTimer) clearTimeout(vocabularyPushTimer);
  vocabularyPushTimer = setTimeout(() => {
    vocabularyPushTimer = undefined;
    flushVocabularyToCloud();
  }, VOCABULARY_PUSH_DEBOUNCE_MS);
  // Don't keep the process alive just for a pending sync.
  vocabularyPushTimer.unref?.();
}
