import { createAppLogger } from "@freestyle-voice/utils";
import { getDb } from "../db.js";
import {
  isTransientCloudError,
  postCloudNotificationAction,
} from "../freestyle-cloud.js";
import { getSessionToken } from "../sessions.js";
import type { NotificationAction } from "./store.js";

const log = createAppLogger("notification-outbox");

const BASE_DELAY_MS = 30_000;
const MAX_DELAY_MS = 3_600_000;
const DRAIN_INTERVAL_MS = 60_000;

export function outboxBackoffMs(attempts: number): number {
  const exp = BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1);
  return Math.min(exp, MAX_DELAY_MS);
}

let draining = false;

export async function drainNotificationOutbox(): Promise<void> {
  if (draining) return;
  const token = getSessionToken();
  if (!token) return;

  const db = getDb();
  const due = db
    .prepare(
      `SELECT notification_id, action, attempts FROM notification_outbox
       WHERE next_attempt_at <= datetime('now')
       ORDER BY next_attempt_at ASC`,
    )
    .all() as {
    notification_id: string;
    action: NotificationAction;
    attempts: number;
  }[];
  if (due.length === 0) return;

  draining = true;
  try {
    for (const row of due) {
      try {
        await postCloudNotificationAction(
          token,
          row.notification_id,
          row.action,
        );
        dropRow(row.notification_id);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (isTransientCloudError(err)) {
          deferRow(row.notification_id, row.attempts + 1, message);
          log.debug(
            `Deferred ${row.action} for ${row.notification_id}: ${message}`,
          );
          break;
        }
        dropRow(row.notification_id);
        log.debug(
          `Dropped ${row.action} for ${row.notification_id}: ${message}`,
        );
      }
    }
  } catch (err) {
    log.debug(
      `Notification outbox drain aborted: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    draining = false;
  }
}

function dropRow(id: string): void {
  getDb()
    .prepare("DELETE FROM notification_outbox WHERE notification_id = ?")
    .run(id);
}

function deferRow(id: string, attempts: number, error: string): void {
  const delaySeconds = Math.round(outboxBackoffMs(attempts) / 1000);
  getDb()
    .prepare(
      `UPDATE notification_outbox
       SET attempts = ?, next_attempt_at = datetime('now', ?), last_error = ?
       WHERE notification_id = ?`,
    )
    .run(attempts, `+${delaySeconds} seconds`, error, id);
}

let drainTimer: NodeJS.Timeout | null = null;

export function startNotificationOutboxDrain(): void {
  if (drainTimer) return;
  void drainNotificationOutbox();
  drainTimer = setInterval(
    () => void drainNotificationOutbox(),
    DRAIN_INTERVAL_MS,
  );
  drainTimer.unref();
}

export function stopNotificationOutboxDrain(): void {
  if (drainTimer) {
    clearInterval(drainTimer);
    drainTimer = null;
  }
}
