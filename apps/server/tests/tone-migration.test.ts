import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { initSchema } from "../src/lib/schema.js";

let db: DatabaseSync | null = null;

afterEach(() => {
  db?.close();
  db = null;
});

describe("tone migration", () => {
  it("backs up custom format rules and drops the legacy table", () => {
    db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE schema_version (
        id INTEGER PRIMARY KEY CHECK(id = 1),
        version INTEGER NOT NULL
      );
      INSERT INTO schema_version (id, version) VALUES (1, 10);

      CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE format_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app_pattern TEXT NOT NULL,
        label TEXT NOT NULL,
        instructions TEXT NOT NULL,
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);

    db.prepare(
      `INSERT INTO format_rules
       (app_pattern, label, instructions, is_default, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      "custom-app",
      "Custom App",
      "Do something very specific.",
      0,
      "2026-06-01 12:00:00",
      "2026-06-02 12:00:00",
    );
    db.prepare(
      `INSERT INTO format_rules
       (app_pattern, label, instructions, is_default, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      "mail.google.com",
      "Default Email",
      "Legacy default",
      1,
      "2026-06-01 12:00:00",
      "2026-06-02 12:00:00",
    );

    initSchema(db);

    const backup = db
      .prepare(
        "SELECT value FROM settings WHERE key = 'legacy_format_rules_backup'",
      )
      .get() as { value: string } | undefined;

    expect(backup).toBeDefined();
    const parsed = JSON.parse(backup!.value) as Array<{
      label: string;
      is_default: number;
      instructions: string;
    }>;
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({
      label: "Custom App",
      is_default: 0,
      instructions: "Do something very specific.",
    });

    const legacyTable = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'format_rules'",
      )
      .get();
    expect(legacyTable).toBeUndefined();
  });
});
