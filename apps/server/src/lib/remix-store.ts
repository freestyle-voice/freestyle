import { getDb } from "./db.js";

/**
 * Local persistence for the Remix agent lane. One thread is "active" at a
 * time; a thread idle past REMIX_THREAD_IDLE_MS is left in place for history
 * and a fresh one starts on the next message.
 */
export const REMIX_THREAD_IDLE_MS = 15 * 60 * 1000;

/** Thread payloads are capped so a long-lived thread can't grow unbounded. */
export const MAX_THREAD_MESSAGES = 40;

export type RemixSessionType = "local" | "remote";

export interface LocalRemixModel {
  provider: string;
  modelId: string;
  modelName: string;
}

export interface RemixThread {
  id: string;
  type: RemixSessionType;
  title: string | null;
  remoteScope: string | null;
  model: LocalRemixModel | null;
  createdAt: string;
  lastActiveAt: string;
}

export interface StoredUiMessage {
  id: string;
  [key: string]: unknown;
}

interface ThreadRow {
  id: string;
  type: RemixSessionType;
  title: string | null;
  remote_scope: string | null;
  model_provider: string | null;
  model_id: string | null;
  model_name: string | null;
  created_at: string;
  last_active_at: string;
}

function rowToThread(row: ThreadRow): RemixThread {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    remoteScope: row.remote_scope,
    model:
      row.model_provider && row.model_id && row.model_name
        ? {
            provider: row.model_provider,
            modelId: row.model_id,
            modelName: row.model_name,
          }
        : null,
    createdAt: row.created_at,
    lastActiveAt: row.last_active_at,
  };
}

function latestThread(type: RemixSessionType): RemixThread | null {
  const row = getDb()
    .prepare(
      "SELECT * FROM remix_threads WHERE type = ? ORDER BY last_active_at DESC LIMIT 1",
    )
    .get(type) as ThreadRow | undefined;
  return row ? rowToThread(row) : null;
}

function isFresh(thread: RemixThread): boolean {
  const last = Date.parse(`${thread.lastActiveAt.replace(" ", "T")}Z`);
  return Number.isFinite(last) && Date.now() - last < REMIX_THREAD_IDLE_MS;
}

/** The latest thread while still fresh, else null. Never creates one — GET
 * must not mutate; thread creation belongs to startNewThread. */
export function getActiveThread(type: RemixSessionType): RemixThread | null {
  const latest = latestThread(type);
  return latest && isFresh(latest) ? latest : null;
}

/** Force a new thread (the card's explicit "new thread" affordance). */
export function createRemixThread(
  type: RemixSessionType,
  model: LocalRemixModel | null = null,
  remoteScope: string | null = null,
): RemixThread {
  if (type === "local" && !model)
    throw new Error("Local Remix sessions require a resolved model");
  if (type === "remote" && !remoteScope)
    throw new Error("Remote Remix sessions require an account scope");
  const db = getDb();
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO remix_threads
      (id, type, remote_scope, model_provider, model_id, model_name)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    type,
    remoteScope,
    model?.provider ?? null,
    model?.modelId ?? null,
    model?.modelName ?? null,
  );
  const row = db.prepare("SELECT * FROM remix_threads WHERE id = ?").get(id) as
    | ThreadRow
    | undefined;
  if (!row) throw new Error("Failed to create remix thread");
  return rowToThread(row);
}

export const startNewThread = createRemixThread;

export function getRemixThread(threadId: string): RemixThread | null {
  const row = getDb()
    .prepare("SELECT * FROM remix_threads WHERE id = ?")
    .get(threadId) as ThreadRow | undefined;
  return row ? rowToThread(row) : null;
}

/** Local sessions are the only complete transcripts owned by this database. */
export function listLocalRemixThreads(limit = 24): RemixThread[] {
  return getDb()
    .prepare(
      `SELECT * FROM remix_threads
       WHERE type = 'local'
       ORDER BY last_active_at DESC
       LIMIT ?`,
    )
    .all(limit)
    .map((row) => rowToThread(row as unknown as ThreadRow));
}

export function updateRemixThreadTitle(
  threadId: string,
  title: string | null,
): boolean {
  const result = getDb()
    .prepare(
      `UPDATE remix_threads
       SET title = ?, last_active_at = datetime('now')
       WHERE id = ? AND type = 'local'`,
    )
    .run(title, threadId);
  return result.changes > 0;
}

export function deleteLocalRemixThread(threadId: string): boolean {
  const result = getDb()
    .prepare("DELETE FROM remix_threads WHERE id = ? AND type = 'local'")
    .run(threadId);
  return result.changes > 0;
}

/** A remote row is sidebar cache metadata only: never a transcript snapshot. */
export function upsertRemoteRemixThread(input: {
  id: string;
  title: string | null;
  remoteScope: string;
  updatedAt?: number;
}): void {
  getDb()
    .prepare(
      `INSERT INTO remix_threads (id, type, title, remote_scope, last_active_at)
       VALUES (?, 'remote', ?, ?, datetime(? / 1000, 'unixepoch'))
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         remote_scope = excluded.remote_scope,
         last_active_at = excluded.last_active_at
       WHERE remix_threads.type = 'remote'`,
    )
    .run(
      input.id,
      input.title,
      input.remoteScope,
      input.updatedAt ?? Date.now(),
    );
}

export function getThreadMessages(threadId: string): StoredUiMessage[] {
  const rows = getDb()
    .prepare(
      "SELECT ui_message FROM remix_messages WHERE thread_id = ? ORDER BY id DESC LIMIT ?",
    )
    .all(threadId, MAX_THREAD_MESSAGES) as { ui_message: string }[];
  rows.reverse();
  const messages: StoredUiMessage[] = [];
  for (const row of rows) {
    try {
      messages.push(JSON.parse(row.ui_message) as StoredUiMessage);
    } catch {
      // A corrupt row loses one message, not the thread.
    }
  }
  return messages;
}

/**
 * Replace the thread's stored messages with the client's copy. The renderer
 * holds the authoritative in-flight state (tool results land there first), so
 * sync is a true snapshot: rows absent from the client's copy are deleted,
 * the rest upserted by the UIMessage id. Returns false when the thread does
 * not exist, so the route can 404 instead of hitting the FK.
 */
export function saveThreadMessages(
  threadId: string,
  messages: StoredUiMessage[],
): boolean {
  const db = getDb();
  const exists = db
    .prepare("SELECT id FROM remix_threads WHERE id = ? AND type = 'local'")
    .get(threadId);
  if (!exists) return false;

  const snapshot = messages
    .slice(-MAX_THREAD_MESSAGES)
    .filter((message) => message?.id);
  const ids = snapshot.map((message) => String(message.id));
  const upsert = db.prepare(
    `INSERT INTO remix_messages (thread_id, message_id, ui_message)
       VALUES (?, ?, ?)
     ON CONFLICT(thread_id, message_id)
       DO UPDATE SET ui_message = excluded.ui_message`,
  );
  db.exec("BEGIN");
  try {
    db.prepare(
      ids.length > 0
        ? `DELETE FROM remix_messages WHERE thread_id = ? AND message_id NOT IN (${ids.map(() => "?").join(", ")})`
        : "DELETE FROM remix_messages WHERE thread_id = ?",
    ).run(threadId, ...ids);
    for (const message of snapshot) {
      upsert.run(threadId, String(message.id), JSON.stringify(message));
    }
    db.prepare(
      `DELETE FROM remix_messages WHERE thread_id = ?
         AND id NOT IN (SELECT id FROM remix_messages
                          WHERE thread_id = ? ORDER BY id DESC LIMIT ?)`,
    ).run(threadId, threadId, MAX_THREAD_MESSAGES);
    db.prepare(
      "UPDATE remix_threads SET last_active_at = datetime('now') WHERE id = ?",
    ).run(threadId);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return true;
}

export interface RemixRunInput {
  threadId?: string | null;
  lane: "transform" | "agent";
  instruction: string;
  beforeText?: string | null;
  afterText: string;
  appName?: string | null;
  llmProvider?: string | null;
  llmModel?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
}

export function recordRemixRun(run: RemixRunInput): number {
  const result = getDb()
    .prepare(
      `INSERT INTO remix_runs
       (thread_id, lane, instruction, before_text, after_text, app_name,
        llm_provider, llm_model, input_tokens, output_tokens, cost_usd)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      run.threadId ?? null,
      run.lane,
      run.instruction,
      run.beforeText ?? null,
      run.afterText,
      run.appName ?? null,
      run.llmProvider ?? null,
      run.llmModel ?? null,
      run.inputTokens ?? 0,
      run.outputTokens ?? 0,
      run.costUsd ?? 0,
    );
  return Number(result.lastInsertRowid);
}

export interface RemixRunRow {
  id: number;
  thread_id: string | null;
  lane: string;
  instruction: string;
  before_text: string | null;
  after_text: string;
  app_name: string | null;
  llm_provider: string | null;
  llm_model: string | null;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  created_at: string;
}

export function listRemixRuns(limit: number, offset: number): RemixRunRow[] {
  return getDb()
    .prepare("SELECT * FROM remix_runs ORDER BY id DESC LIMIT ? OFFSET ?")
    .all(limit, offset) as unknown as RemixRunRow[];
}

export function getRemixRun(id: number): RemixRunRow | null {
  const row = getDb()
    .prepare("SELECT * FROM remix_runs WHERE id = ?")
    .get(id) as RemixRunRow | undefined;
  return row ?? null;
}

export function deleteRemixRun(id: number): void {
  getDb().prepare("DELETE FROM remix_runs WHERE id = ?").run(id);
}

export function purgeExpiredRemixData(retentionDays: number): number {
  const db = getDb();
  const cutoff = `-${retentionDays} days`;
  const runs = db
    .prepare("DELETE FROM remix_runs WHERE created_at < datetime('now', ?)")
    .run(cutoff);
  const activeThreadId = getActiveThread("local")?.id ?? "";
  const threads = db
    .prepare(
      "DELETE FROM remix_threads WHERE last_active_at < datetime('now', ?) AND id != ?",
    )
    .run(cutoff, activeThreadId);
  return Number(runs.changes) + Number(threads.changes);
}
