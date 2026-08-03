import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { initSchema } from "../src/lib/schema.js";

let db: DatabaseSync | null = null;

afterEach(() => {
  db?.close();
  db = null;
});

describe("sync_outbox migration (v18)", () => {
  it("creates the sync_outbox table when upgrading an existing DB", () => {
    db = new DatabaseSync(":memory:");
    // Minimal pre-v18 DB: just the version marker + settings table. The v18
    // migration only adds a new table, so no prior tables are required.
    // initSchema then runs every subsequent migration through SCHEMA_VERSION,
    // so the final version asserted below is the current schema head.
    db.exec(`
      CREATE TABLE schema_version (
        id INTEGER PRIMARY KEY CHECK(id = 1),
        version INTEGER NOT NULL
      );
      INSERT INTO schema_version (id, version) VALUES (1, 17);

      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    initSchema(db);

    // Table exists.
    const table = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sync_outbox'",
      )
      .get();
    expect(table).toBeDefined();

    // Version was bumped.
    const version = db
      .prepare("SELECT version FROM schema_version WHERE id = 1")
      .get() as { version: number };
    expect(version.version).toBeGreaterThanOrEqual(18);

    // The expected columns are present and usable.
    db.prepare(
      `INSERT INTO sync_outbox (cloud_field, payload) VALUES (?, ?)`,
    ).run("languages", '{"languages":["en"]}');
    const stored = db
      .prepare(
        "SELECT cloud_field, payload, attempts, next_attempt_at FROM sync_outbox",
      )
      .get() as {
      cloud_field: string;
      payload: string;
      attempts: number;
      next_attempt_at: string;
    };
    expect(stored.cloud_field).toBe("languages");
    expect(stored.attempts).toBe(0);
    expect(stored.next_attempt_at).toBeTruthy();
  });
});
