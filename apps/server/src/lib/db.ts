import { DatabaseSync } from "node:sqlite";
import { initSchema } from "./schema.js";

let db: DatabaseSync | null = null;

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

export function closeDb(): void {
  if (db) {
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
    const row = getDb()
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get(key) as { value: string } | undefined;
    return row?.value;
  } catch {
    return undefined;
  }
}

/** Upsert a settings row. */
export function writeSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    )
    .run(key, value);
}
