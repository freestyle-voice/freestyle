import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { initSchema } from "../src/lib/schema.js";

let db: DatabaseSync | null = null;

afterEach(() => {
  db?.close();
  db = null;
});

const SINGLETON_SESSIONS = `
  CREATE TABLE sessions (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at INTEGER,
    issued_at INTEGER,
    user_id TEXT NOT NULL,
    email TEXT NOT NULL,
    name TEXT,
    image TEXT,
    host TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );
`;

const VERSION_AND_SETTINGS = `
  CREATE TABLE schema_version (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    version INTEGER NOT NULL
  );
  INSERT INTO schema_version (id, version) VALUES (1, 19);

  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`;

function hasTable(database: DatabaseSync, name: string): boolean {
  return !!database
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
    .get(name);
}

function hostIsPrimaryKey(database: DatabaseSync): boolean {
  const cols = database.prepare("PRAGMA table_info(sessions)").all() as {
    name: string;
    pk: number;
  }[];
  return cols.some((col) => col.name === "host" && col.pk > 0);
}

describe("v20 merge reconciliation", () => {
  it("repairs a prototype-lineage DB: singleton sessions, no dismissed_notifications", () => {
    db = new DatabaseSync(":memory:");
    db.exec(`
      ${VERSION_AND_SETTINGS}
      ${SINGLETON_SESSIONS}
      INSERT INTO sessions
        (id, token, user_id, email, host, updated_at)
        VALUES (1, 'tok', 'u1', 'user@example.com', 'https://service.freestylevoice.com', 0);
      CREATE TABLE remix_threads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_active_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    initSchema(db);

    expect(hostIsPrimaryKey(db!)).toBe(true);
    const session = db
      .prepare("SELECT id, email FROM sessions WHERE host = ?")
      .get("https://service.freestylevoice.com") as {
      id: number;
      email: string;
    };
    expect(session.email).toBe("user@example.com");
    expect(session.id).toBe(1);

    expect(hasTable(db!, "dismissed_notifications")).toBe(true);

    db.prepare(
      `INSERT INTO sessions (host, token, user_id, email, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(host) DO UPDATE SET token = excluded.token`,
    ).run("http://localhost:8787", "tok2", "u1", "user@example.com", 1);
  });

  it("repairs a main-lineage DB: host-keyed sessions but no Remix tables", () => {
    db = new DatabaseSync(":memory:");
    db.exec(`
      ${VERSION_AND_SETTINGS}
      CREATE TABLE sessions (
        id INTEGER UNIQUE,
        host TEXT PRIMARY KEY NOT NULL,
        token TEXT NOT NULL,
        refresh_token TEXT,
        expires_at INTEGER,
        issued_at INTEGER,
        user_id TEXT NOT NULL,
        email TEXT NOT NULL,
        name TEXT,
        image TEXT,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE dismissed_notifications (
        key          TEXT PRIMARY KEY,
        dismissed_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    initSchema(db);

    for (const table of ["remix_threads", "remix_messages", "remix_runs"]) {
      expect(hasTable(db!, table)).toBe(true);
    }
    expect(hostIsPrimaryKey(db!)).toBe(true);
  });

  it("is a no-op on a DB that already ran the reconciliation", () => {
    db = new DatabaseSync(":memory:");
    db.exec(`
      ${VERSION_AND_SETTINGS}
      CREATE TABLE sessions (
        id INTEGER UNIQUE,
        host TEXT PRIMARY KEY NOT NULL,
        token TEXT NOT NULL,
        user_id TEXT NOT NULL,
        email TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      INSERT INTO sessions (id, host, token, user_id, email, updated_at)
        VALUES (1, 'https://service.freestylevoice.com', 'tok', 'u1', 'user@example.com', 0);
    `);
    initSchema(db);
    const version = (): number =>
      (
        db!
          .prepare("SELECT version FROM schema_version WHERE id = 1")
          .get() as {
          version: number;
        }
      ).version;
    expect(version()).toBeGreaterThanOrEqual(20);

    initSchema(db);
    expect(hasTable(db!, "remix_threads")).toBe(true);
    expect(hasTable(db!, "dismissed_notifications")).toBe(true);
    expect(hostIsPrimaryKey(db!)).toBe(true);
    const session = db
      .prepare("SELECT email FROM sessions WHERE host = ?")
      .get("https://service.freestylevoice.com") as { email: string };
    expect(session.email).toBe("user@example.com");
  });
});
