/**
 * Durable outbox for cloud preference syncs.
 *
 * Cloud preference/vocabulary pushes are local-first: the local SQLite write is
 * the source of truth and always commits first. This module makes the *cloud*
 * side of that sync durable so a push that fails while offline (or against a
 * down / 5xx server) is retried instead of silently lost.
 *
 * Model:
 *   - {@link enqueueOutbox} upserts one row per cloud field (the cloud replaces
 *     a field wholesale on PUT, so only the newest value matters — a burst of
 *     offline edits collapses to a single row) and kicks an immediate drain.
 *   - {@link drainOutbox} flushes every due row: on 200 the row is deleted; on a
 *     transient error (network / 5xx) the row is kept with exponential backoff
 *     (1 min → 1 hr) and the drain stops for this tick (the server is down);
 *     on a permanent 4xx (bad org / auth / validation) the row is dropped.
 *   - {@link startOutboxDrain} runs a periodic drain so rows whose backoff has
 *     elapsed get retried without any user action.
 *
 * All entry points are fire-and-forget and never throw, mirroring the rest of
 * the preference-sync bridge: a failed sync must never disrupt a local write.
 */

import { createAppLogger } from "@freestyle-voice/utils";
import type { MemberPreferencesInput } from "@freestyle-voice/validations";
import { getDb } from "./db.js";
import {
  isTransientCloudError,
  putCloudPreferences,
  resolveActiveOrgSlug,
} from "./freestyle-cloud.js";
import { getSessionToken } from "./sessions.js";

const log = createAppLogger("sync-outbox");

/** First retry delay; each subsequent attempt doubles up to the cap. */
const OUTBOX_BASE_DELAY_MS = 60_000; // 1 min
/** Ceiling for the retry backoff. */
const OUTBOX_MAX_DELAY_MS = 3_600_000; // 1 hr
/** How often the background driver checks for due rows. */
const OUTBOX_DRAIN_INTERVAL_MS = 60_000; // 1 min

/**
 * Backoff before the next attempt, given how many attempts have already failed.
 * `attempts = 1` → base delay; doubles each time; capped at the max.
 */
export function outboxBackoffMs(attempts: number): number {
  const exp = OUTBOX_BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1);
  return Math.min(exp, OUTBOX_MAX_DELAY_MS);
}

/**
 * Queue a partial preference patch for durable delivery to the cloud, then try
 * to flush it immediately. Upserts by `cloudField` so a newer value supersedes a
 * pending one and resets its retry state (a fresh edit deserves an immediate
 * attempt). No-op when signed out — there's nothing to deliver to.
 */
export function enqueueOutbox(
  cloudField: string,
  patch: MemberPreferencesInput,
): void {
  if (!getSessionToken()) return;

  try {
    getDb()
      .prepare(
        `INSERT INTO sync_outbox (cloud_field, payload, updated_at, next_attempt_at, attempts, last_error)
         VALUES (?, ?, datetime('now'), datetime('now'), 0, NULL)
         ON CONFLICT(cloud_field) DO UPDATE SET
           payload = excluded.payload,
           updated_at = datetime('now'),
           next_attempt_at = datetime('now'),
           attempts = 0,
           last_error = NULL`,
      )
      .run(cloudField, JSON.stringify(patch));
  } catch (err) {
    // The local write already succeeded; a failure to enqueue the cloud sync
    // must never propagate back to the caller (the settings/vocab route).
    log.debug(
      `Failed to enqueue outbox row ${cloudField}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return;
  }

  void drainOutbox();
}

// Guards against overlapping drains (the periodic timer + an immediate
// enqueue-triggered drain could otherwise run concurrently and double-send).
let draining = false;

/**
 * Attempt to deliver every due outbox row to the cloud. Never throws. No-op when
 * signed out, when there's no active org yet, or when a drain is already in
 * flight.
 */
export async function drainOutbox(): Promise<void> {
  if (draining) return;

  const token = getSessionToken();
  if (!token) return;

  const db = getDb();
  const due = db
    .prepare(
      `SELECT cloud_field, payload, attempts FROM sync_outbox
       WHERE next_attempt_at <= datetime('now')
       ORDER BY updated_at ASC`,
    )
    .all() as { cloud_field: string; payload: string; attempts: number }[];
  if (due.length === 0) return;

  draining = true;
  try {
    const orgSlug = await resolveActiveOrgSlug(token);
    if (!orgSlug) return; // no active org yet — keep rows, try again later

    for (const row of due) {
      let patch: MemberPreferencesInput;
      try {
        patch = JSON.parse(row.payload) as MemberPreferencesInput;
      } catch {
        // Corrupt payload (shouldn't happen) — drop it rather than retry forever.
        dropRow(row.cloud_field);
        log.debug(`Dropped outbox row ${row.cloud_field}: corrupt payload`);
        continue;
      }

      try {
        await putCloudPreferences(token, orgSlug, patch);
        dropRow(row.cloud_field);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (isTransientCloudError(err)) {
          // Server/network is down — back off and stop this tick; the rest of
          // the queue would fail the same way.
          deferRow(row.cloud_field, row.attempts + 1, message);
          log.debug(`Outbox retry deferred for ${row.cloud_field}: ${message}`);
          break;
        }
        // Permanent failure (4xx: bad org / auth / validation) — drop it.
        dropRow(row.cloud_field);
        log.debug(`Dropped outbox row ${row.cloud_field}: ${message}`);
      }
    }
  } catch (err) {
    // Never throw out of a fire-and-forget drain (e.g. a DB error during
    // dropRow/deferRow, or an org lookup fault).
    log.debug(
      `Outbox drain aborted: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    draining = false;
  }
}

/** Remove a delivered/dropped row. */
function dropRow(cloudField: string): void {
  getDb()
    .prepare("DELETE FROM sync_outbox WHERE cloud_field = ?")
    .run(cloudField);
}

/** Record a transient failure and schedule the next attempt with backoff. */
function deferRow(cloudField: string, attempts: number, error: string): void {
  const delaySeconds = Math.round(outboxBackoffMs(attempts) / 1000);
  getDb()
    .prepare(
      `UPDATE sync_outbox
       SET attempts = ?, next_attempt_at = datetime('now', ?), last_error = ?
       WHERE cloud_field = ?`,
    )
    .run(attempts, `+${delaySeconds} seconds`, error, cloudField);
}

let drainTimer: NodeJS.Timeout | null = null;

/**
 * Start the periodic outbox drain. Idempotent. Runs an immediate drain, then
 * checks for due rows on an interval. Unref'd so it never keeps the process
 * alive on its own.
 */
export function startOutboxDrain(): void {
  if (drainTimer) return;
  void drainOutbox();
  drainTimer = setInterval(() => void drainOutbox(), OUTBOX_DRAIN_INTERVAL_MS);
  drainTimer.unref();
}

/** Stop the periodic outbox drain. */
export function stopOutboxDrain(): void {
  if (drainTimer) {
    clearInterval(drainTimer);
    drainTimer = null;
  }
}

/**
 * Discard all pending outbox rows. Called on sign-out so a queue built up under
 * one account is never delivered to a different account that signs in next.
 * Never throws.
 */
export function clearOutbox(): void {
  try {
    getDb().exec("DELETE FROM sync_outbox");
  } catch (err) {
    log.debug(
      `Failed to clear outbox: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
