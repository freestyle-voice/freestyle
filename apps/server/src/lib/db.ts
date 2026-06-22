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

  db = new DatabaseSync(dbPath);

  // Performance and safety pragmas
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA synchronous = NORMAL");

  initSchema(db);

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
