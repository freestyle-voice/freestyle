import { getDb } from "./db.js";

/**
 * Local persistence for the Remix agent lane. One thread is "active" at a
 * time; a thread idle past REMIX_THREAD_IDLE_MS is left in place for history
 * and a fresh one starts on the next message.
 */
export const REMIX_THREAD_IDLE_MS = 15 * 60 * 1000;

/** Thread payloads are capped so a long-lived thread can't grow unbounded. */
const MAX_THREAD_MESSAGES = 40;

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

/** The thread new messages should join: the latest one if fresh, else new. */
export function getActiveThread(): { thread: RemixThread; resumed: boolean } {
  const latest = latestThread();
  if (latest && isFresh(latest)) return { thread: latest, resumed: true };
  const db = getDb();
  db.prepare("INSERT INTO remix_threads DEFAULT VALUES").run();
  const created = latestThread();
  if (!created) throw new Error("Failed to create remix thread");
  return { thread: created, resumed: false };
}

/** Force a new thread (the card's explicit "new thread" affordance). */
export function startNewThread(): RemixThread {
  const db = getDb();
  db.prepare("INSERT INTO remix_threads DEFAULT VALUES").run();
  const created = latestThread();
  if (!created) throw new Error("Failed to create remix thread");
  return created;
}

export function getThreadMessages(threadId: number): StoredUiMessage[] {
  const rows = getDb()
    .prepare(
      "SELECT ui_message FROM remix_messages WHERE thread_id = ? ORDER BY id ASC",
    )
    .all(threadId) as { ui_message: string }[];
  const messages: StoredUiMessage[] = [];
  for (const row of rows) {
    try {
      messages.push(JSON.parse(row.ui_message) as StoredUiMessage);
    } catch {
      // A corrupt row loses one message, not the thread.
    }
  }
  return messages.slice(-MAX_THREAD_MESSAGES);
}

/**
 * Replace the thread's stored messages with the client's copy. The renderer
 * holds the authoritative in-flight state (tool results land there first), so
 * sync is snapshot-in, not append-only. Upserts by the UIMessage id.
 */
export function saveThreadMessages(
  threadId: number,
  messages: StoredUiMessage[],
): void {
  const db = getDb();
  const upsert = db.prepare(
    `INSERT INTO remix_messages (thread_id, message_id, ui_message)
       VALUES (?, ?, ?)
     ON CONFLICT(thread_id, message_id)
       DO UPDATE SET ui_message = excluded.ui_message`,
  );
  db.exec("BEGIN");
  try {
    for (const message of messages.slice(-MAX_THREAD_MESSAGES)) {
      if (!message?.id) continue;
      upsert.run(threadId, String(message.id), JSON.stringify(message));
    }
    db.prepare(
      "UPDATE remix_threads SET last_active_at = datetime('now') WHERE id = ?",
    ).run(threadId);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
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
  const db = getDb();
  db.prepare(
    `INSERT INTO remix_runs
       (thread_id, lane, instruction, before_text, after_text, app_name,
        llm_provider, llm_model, input_tokens, output_tokens, cost_usd)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
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
  const row = db.prepare("SELECT last_insert_rowid() AS id").get() as {
    id: number;
  };
  return row.id;
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
