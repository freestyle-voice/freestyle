import { DatabaseSync, type StatementSync } from "node:sqlite";
import { initSchema } from "./schema.js";

let db: DatabaseSync | null = null;

// Cache prepared statements keyed by their SQL text. `node:sqlite` recompiles
// SQL on every `.prepare()` call, and the transcription hot path issues dozens
// of tiny point-queries per dictation (settings reads, default-model lookups,
// history writes). Reusing a compiled statement removes that repeated parse.
// The cache is scoped to the single long-lived connection and cleared when the
// connection is closed.
const statementCache = new Map<string, StatementSync>();

export function getDb(): DatabaseSync {
  if (db) return db;

  const dbPath = process.env.FREESTYLE_DB_PATH;
  if (!dbPath) {
    throw new Error(
      "FREESTYLE_DB_PATH environment variable is required. Set it to the desired SQLite database file path.",
    );
  }

  const instance = new DatabaseSync(dbPath);

  // Performance and safety pragmas
  instance.exec("PRAGMA journal_mode = WAL");
  instance.exec("PRAGMA busy_timeout = 5000");
  instance.exec("PRAGMA foreign_keys = ON");
  instance.exec("PRAGMA synchronous = NORMAL");

  initSchema(instance);

  // Cache only after schema init succeeds — if initSchema() throws, the next
  // getDb() call will retry from scratch instead of returning an instance
  // with missing tables.
  db = instance;

  return db;
}

/**
 * Prepare (or reuse a cached) statement for the given SQL against the shared
 * connection. Prefer this over `getDb().prepare(...)` on hot paths so the SQL
 * is compiled once per process rather than on every call.
 */
export function prepareCached(sql: string): StatementSync {
  const cached = statementCache.get(sql);
  if (cached) return cached;
  const stmt = getDb().prepare(sql);
  statementCache.set(sql, stmt);
  return stmt;
}

export function closeDb(): void {
  if (db) {
    statementCache.clear();
    db.close();
    db = null;
  }
}

/**
 * Read a single value from the key/value `settings` table. Returns `undefined`
 * when the key is unset or the database/table is not yet available.
 */
export function readSetting(key: string): string | undefined {
  try {
    const row = prepareCached("SELECT value FROM settings WHERE key = ?").get(
      key,
    ) as { value: string } | undefined;
    return row?.value;
  } catch {
    return undefined;
  }
}

/**
 * Read many settings values in a single query and return them as a `Map`.
 * Prefer this over N individual {@link readSetting} calls on hot paths (e.g.
 * resolving all cleanup tones for a dictation). Missing keys are simply absent
 * from the map. Returns an empty map if the DB is unavailable.
 */
export function readSettings(keys: readonly string[]): Map<string, string> {
  const result = new Map<string, string>();
  if (keys.length === 0) return result;
  try {
    const placeholders = keys.map(() => "?").join(", ");
    const rows = prepareCached(
      `SELECT key, value FROM settings WHERE key IN (${placeholders})`,
    ).all(...keys) as { key: string; value: string }[];
    for (const row of rows) result.set(row.key, row.value);
  } catch {
    // DB may not be available yet — return whatever we have (possibly empty).
  }
  return result;
}

/** Upsert a settings row. */
export function writeSetting(key: string, value: string): void {
  prepareCached(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
  ).run(key, value);
}

/** Delete a settings row by key. No-op if the key doesn't exist. */
export function deleteSetting(key: string): void {
  try {
    prepareCached("DELETE FROM settings WHERE key = ?").run(key);
  } catch {
    // DB may not be available yet — swallow.
  }
}
