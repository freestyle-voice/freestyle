import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { initSchema } from "../src/lib/schema.js";

describe("Courier Inbox authority migration", () => {
  it("drops the legacy desktop notification store and outbox", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE schema_version (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        version INTEGER NOT NULL
      );
      INSERT INTO schema_version (id, version) VALUES (1, 26);
      CREATE TABLE notifications (id TEXT PRIMARY KEY);
      CREATE TABLE notification_outbox (notification_id TEXT PRIMARY KEY);
    `);

    initSchema(db);

    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('notifications', 'notification_outbox')",
      )
      .all();
    expect(tables).toEqual([]);
    expect(
      db.prepare("SELECT version FROM schema_version WHERE id = 1").get(),
    ).toEqual({ version: 27 });
    db.close();
  });
});
