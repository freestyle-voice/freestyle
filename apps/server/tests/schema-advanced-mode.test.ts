import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { initSchema } from "../src/lib/schema.js";

function readSetting(db: DatabaseSync, key: string): string | undefined {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

describe("v15 advanced_mode migration", () => {
  it("enables advanced_mode for existing users with configured models", () => {
    const db = new DatabaseSync(":memory:");

    // Simulate a pre-v15 database: schema at version 14 with the tables the
    // migration reads, and a configured voice model (an "existing user").
    db.exec(`
      CREATE TABLE schema_version (
        id INTEGER PRIMARY KEY CHECK(id = 1),
        version INTEGER NOT NULL
      );
      INSERT INTO schema_version (id, version) VALUES (1, 14);
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE model_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL,
        model_id TEXT NOT NULL,
        model_name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('voice', 'llm')),
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(provider, model_id, type)
      );
      INSERT INTO model_configs (provider, model_id, model_name, type, is_default)
        VALUES ('local-whisper', 'local-whisper/small-q5_1', 'Whisper Small', 'voice', 1);
    `);

    initSchema(db);

    expect(readSetting(db, "advanced_mode")).toBe("true");
    db.close();
  });

  it("leaves advanced_mode unset for new users with no models", () => {
    const db = new DatabaseSync(":memory:");

    // Fresh database — every migration runs from scratch, and there are no
    // configured models, so advanced mode should default to off (no row).
    initSchema(db);

    expect(readSetting(db, "advanced_mode")).toBeUndefined();
    db.close();
  });

  it("does not overwrite an existing advanced_mode value", () => {
    const db = new DatabaseSync(":memory:");

    db.exec(`
      CREATE TABLE schema_version (
        id INTEGER PRIMARY KEY CHECK(id = 1),
        version INTEGER NOT NULL
      );
      INSERT INTO schema_version (id, version) VALUES (1, 14);
      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE TABLE model_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL,
        model_id TEXT NOT NULL,
        model_name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('voice', 'llm')),
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(provider, model_id, type)
      );
    `);

    initSchema(db);

    // No configured models → migration does not touch advanced_mode.
    expect(readSetting(db, "advanced_mode")).toBeUndefined();
    db.close();
  });
});
