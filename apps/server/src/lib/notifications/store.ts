import { randomUUID } from "node:crypto";
import { createAppLogger } from "@freestyle-voice/utils";
import { getDb } from "../db.js";

const log = createAppLogger("notifications");

export type NotificationOrigin = "cloud" | "local";
export type NotificationKind = "thread" | "info";
export type NotificationAction = "dismiss" | "open";

export interface NotificationPayload {
  threadId?: string;
  messages?: unknown[];
  url?: string;
}

export interface NotificationRecord {
  id: string;
  origin: NotificationOrigin;
  kind: NotificationKind;
  title: string;
  body: string;
  payload: NotificationPayload | null;
  threadId: string | null;
  createdAt: number;
  expiresAt: number | null;
  seenAt: number | null;
}

export interface CloudNotificationInput {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  payload?: NotificationPayload | null;
  createdAt: number;
  expiresAt?: number | null;
}

export interface LocalNotificationInput {
  kind: NotificationKind;
  title: string;
  body: string;
  payload?: NotificationPayload | null;
  threadId?: string | null;
  expiresAt?: number | null;
}

interface Row {
  id: string;
  origin: string;
  kind: string;
  title: string;
  body: string;
  payload: string | null;
  thread_id: string | null;
  created_at: number;
  expires_at: number | null;
  seen_at: number | null;
}

const LOCAL_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function toRecord(row: Row): NotificationRecord {
  let payload: NotificationPayload | null = null;
  if (row.payload) {
    try {
      payload = JSON.parse(row.payload) as NotificationPayload;
    } catch {
      payload = null;
    }
  }
  return {
    id: row.id,
    origin: row.origin === "local" ? "local" : "cloud",
    kind: row.kind === "info" ? "info" : "thread",
    title: row.title,
    body: row.body,
    payload,
    threadId: row.thread_id,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    seenAt: row.seen_at,
  };
}

export function listActive(): NotificationRecord[] {
  const now = Date.now();
  const rows = getDb()
    .prepare(
      `SELECT * FROM notifications
       WHERE dismissed_at IS NULL AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY created_at DESC
       LIMIT 50`,
    )
    .all(now) as unknown as Row[];
  return rows.map(toRecord);
}

export function getNotification(id: string): NotificationRecord | null {
  const row = getDb()
    .prepare("SELECT * FROM notifications WHERE id = ?")
    .get(id) as unknown as Row | undefined;
  return row ? toRecord(row) : null;
}

export function upsertFromCloud(
  incoming: CloudNotificationInput[],
  userId: string | null,
): void {
  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO notifications
       (id, origin, kind, title, body, payload, thread_id, user_id, created_at, expires_at, dismissed_at, seen_at)
     VALUES (?, 'cloud', ?, ?, ?, ?, NULL, ?, ?, ?, NULL, NULL)
     ON CONFLICT(id) DO UPDATE SET
       kind = excluded.kind,
       title = excluded.title,
       body = excluded.body,
       payload = excluded.payload,
       expires_at = excluded.expires_at,
       seen_at = CASE WHEN excluded.created_at > notifications.created_at THEN NULL ELSE notifications.seen_at END,
       dismissed_at = CASE WHEN excluded.created_at > notifications.created_at THEN NULL ELSE notifications.dismissed_at END,
       created_at = MAX(excluded.created_at, notifications.created_at)`,
  );

  db.exec("BEGIN");
  try {
    for (const row of incoming) {
      insert.run(
        row.id,
        row.kind,
        row.title,
        row.body,
        row.payload ? JSON.stringify(row.payload) : null,
        userId,
        row.createdAt,
        row.expiresAt ?? null,
      );
    }
    const keep = new Set(incoming.map((r) => r.id));
    const existing = db
      .prepare(
        `SELECT id FROM notifications
         WHERE origin = 'cloud' AND dismissed_at IS NULL`,
      )
      .all() as unknown as { id: string }[];
    const pending = new Set(
      (
        db
          .prepare("SELECT notification_id FROM notification_outbox")
          .all() as unknown as { notification_id: string }[]
      ).map((r) => r.notification_id),
    );
    const remove = db.prepare("DELETE FROM notifications WHERE id = ?");
    for (const row of existing) {
      if (keep.has(row.id) || pending.has(row.id)) continue;
      remove.run(row.id);
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function createLocal(input: LocalNotificationInput): NotificationRecord {
  const id = `local:${randomUUID()}`;
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO notifications
         (id, origin, kind, title, body, payload, thread_id, user_id, created_at, expires_at, dismissed_at, seen_at)
       VALUES (?, 'local', ?, ?, ?, ?, ?, NULL, ?, ?, NULL, NULL)`,
    )
    .run(
      id,
      input.kind,
      input.title,
      input.body,
      input.payload ? JSON.stringify(input.payload) : null,
      input.threadId ?? null,
      now,
      input.expiresAt ?? now + LOCAL_TTL_MS,
    );
  const record = getNotification(id);
  if (!record) throw new Error("notification-insert-failed");
  return record;
}

function enqueue(id: string, action: NotificationAction): void {
  try {
    getDb()
      .prepare(
        `INSERT INTO notification_outbox (notification_id, action, next_attempt_at, attempts, last_error)
         VALUES (?, ?, datetime('now'), 0, NULL)
         ON CONFLICT(notification_id) DO UPDATE SET
           action = excluded.action,
           next_attempt_at = datetime('now'),
           attempts = 0,
           last_error = NULL`,
      )
      .run(id, action);
  } catch (err) {
    log.debug(
      `Failed to enqueue notification ${action}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export function dismiss(id: string): boolean {
  const record = getNotification(id);
  if (!record) return false;
  getDb()
    .prepare(
      "UPDATE notifications SET dismissed_at = ? WHERE id = ? AND dismissed_at IS NULL",
    )
    .run(Date.now(), id);
  if (record.origin === "cloud") enqueue(id, "dismiss");
  return true;
}

export interface OpenResult {
  ok: boolean;
  threadId?: string;
  url?: string;
}

export function open(id: string): OpenResult {
  const record = getNotification(id);
  if (!record) return { ok: false };

  const threadId = record.threadId ?? record.payload?.threadId ?? null;
  if (threadId && !record.threadId) {
    getDb()
      .prepare("UPDATE notifications SET thread_id = ? WHERE id = ?")
      .run(threadId, id);
  }

  getDb()
    .prepare(
      "UPDATE notifications SET dismissed_at = ? WHERE id = ? AND dismissed_at IS NULL",
    )
    .run(Date.now(), id);
  if (record.origin === "cloud") enqueue(id, "open");

  return {
    ok: true,
    ...(threadId ? { threadId } : {}),
    ...(record.payload?.url ? { url: record.payload.url } : {}),
  };
}

export function markSeen(ids: string[]): void {
  if (ids.length === 0) return;
  const db = getDb();
  const stmt = db.prepare(
    "UPDATE notifications SET seen_at = ? WHERE id = ? AND seen_at IS NULL",
  );
  const now = Date.now();
  db.exec("BEGIN");
  try {
    for (const id of ids) stmt.run(now, id);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export function unseen(): NotificationRecord[] {
  return listActive().filter((n) => n.seenAt === null);
}

export function purgeExpired(): void {
  try {
    getDb()
      .prepare(
        "DELETE FROM notifications WHERE expires_at IS NOT NULL AND expires_at <= ?",
      )
      .run(Date.now());
  } catch (err) {
    log.debug(
      `Failed to purge expired notifications: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

export function purgeForAccountChange(): void {
  try {
    const db = getDb();
    db.exec("DELETE FROM notifications");
    db.exec("DELETE FROM notification_outbox");
  } catch (err) {
    log.debug(
      `Failed to purge notifications: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
