import { getDb } from "./db.js";

/**
 * Local persistence for the Remix agent lane. One thread is "active" at a
 * time; a thread idle past REMIX_THREAD_IDLE_MS is left in place for history
 * and a fresh one starts on the next message.
 */
export const REMIX_THREAD_IDLE_MS = 15 * 60 * 1000;

/** Thread payloads are capped so a long-lived thread can't grow unbounded. */
export const MAX_THREAD_MESSAGES = 40;

export interface RemixThread {
  id: number;
  createdAt: string;
  lastActiveAt: string;
}

export interface StoredUiMessage {
  id: string;
  [key: string]: unknown;
}

interface ThreadRow {
  id: number;
  created_at: string;
  last_active_at: string;
}

function rowToThread(row: ThreadRow): RemixThread {
  return {
    id: row.id,
    createdAt: row.created_at,
    lastActiveAt: row.last_active_at,
  };
}

function latestThread(): RemixThread | null {
  const row = getDb()
    .prepare("SELECT * FROM remix_threads ORDER BY id DESC LIMIT 1")
    .get() as ThreadRow | undefined;
  return row ? rowToThread(row) : null;
}

function isFresh(thread: RemixThread): boolean {
  const last = Date.parse(`${thread.lastActiveAt.replace(" ", "T")}Z`);
  return Number.isFinite(last) && Date.now() - last < REMIX_THREAD_IDLE_MS;
}

/** The latest thread while still fresh, else null. Never creates one — GET
 * must not mutate; thread creation belongs to startNewThread. */
export function getActiveThread(): RemixThread | null {
  const latest = latestThread();
  return latest && isFresh(latest) ? latest : null;
}

/** Force a new thread (the card's explicit "new thread" affordance). */
export function startNewThread(): RemixThread {
  const db = getDb();
  const id = Number(
    db.prepare("INSERT INTO remix_threads DEFAULT VALUES").run()
      .lastInsertRowid,
  );
  const row = db.prepare("SELECT * FROM remix_threads WHERE id = ?").get(id) as
    | ThreadRow
    | undefined;
  if (!row) throw new Error("Failed to create remix thread");
  return rowToThread(row);
}

export function getThreadMessages(threadId: number): StoredUiMessage[] {
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
  threadId: number,
  messages: StoredUiMessage[],
): boolean {
  const db = getDb();
  const exists = db
    .prepare("SELECT id FROM remix_threads WHERE id = ?")
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

export interface RemixThreadSummary {
  id: number;
  createdAt: string;
  lastActiveAt: string;
  /** First user message text, truncated — a human-readable title. */
  preview: string;
  messageCount: number;
}

const PREVIEW_MAX = 120;

/** The first user message's plain text from a stored UIMessage row, or "". */
function previewFromUiMessage(uiMessage: string): string {
  try {
    const message = JSON.parse(uiMessage) as {
      role?: string;
      parts?: { type?: string; text?: string }[];
    };
    if (message.role !== "user") return "";
    const text = (message.parts ?? [])
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text as string)
      .join(" ")
      .trim();
    if (!text) return "";
    return text.length > PREVIEW_MAX
      ? `${text.slice(0, PREVIEW_MAX).trimEnd()}…`
      : text;
  } catch {
    // A corrupt row yields no preview, not an error.
    return "";
  }
}

/**
 * List past conversations, newest first. Threads with no stored messages are
 * omitted — they carry no title and nothing to resume. Each summary carries a
 * preview (the first user message) so the pill can render a readable title
 * without shipping every message.
 *
 * The preview is resolved in a single batched query (a correlated
 * earliest-message lookup per listed thread) rather than a per-thread read,
 * so listing N threads costs one query, not N+1.
 */
export function listThreads(
  limit: number,
  offset: number,
): RemixThreadSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT t.id,
              t.created_at,
              t.last_active_at,
              COUNT(m.id) AS message_count,
              (SELECT em.ui_message
                 FROM remix_messages em
                WHERE em.thread_id = t.id
                ORDER BY em.id ASC
                LIMIT 1) AS first_message
         FROM remix_threads t
         JOIN remix_messages m ON m.thread_id = t.id
        GROUP BY t.id
       HAVING message_count > 0
        ORDER BY t.last_active_at DESC, t.id DESC
        LIMIT ? OFFSET ?`,
    )
    .all(limit, offset) as {
    id: number;
    created_at: string;
    last_active_at: string;
    message_count: number;
    first_message: string | null;
  }[];
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    lastActiveAt: row.last_active_at,
    preview: row.first_message ? previewFromUiMessage(row.first_message) : "",
    messageCount: row.message_count,
  }));
}

/** A single past thread with its messages, or null when it doesn't exist. */
export function getThread(
  threadId: number,
): { thread: RemixThread; messages: StoredUiMessage[] } | null {
  const row = getDb()
    .prepare("SELECT * FROM remix_threads WHERE id = ?")
    .get(threadId) as ThreadRow | undefined;
  if (!row) return null;
  return { thread: rowToThread(row), messages: getThreadMessages(threadId) };
}

export interface RemixRunInput {
  threadId?: number | null;
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
  thread_id: number | null;
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
  const activeThreadId = getActiveThread()?.id ?? -1;
  const threads = db
    .prepare(
      "DELETE FROM remix_threads WHERE last_active_at < datetime('now', ?) AND id != ?",
    )
    .run(cutoff, activeThreadId);
  return Number(runs.changes) + Number(threads.changes);
}
