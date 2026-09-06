import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { initSchema } from "../src/lib/schema.js";

describe("sync operation ordering migration", () => {
  it("upgrades the v30 single-operation queue without losing its operation", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE schema_version (
        id INTEGER PRIMARY KEY CHECK(id = 1),
        version INTEGER NOT NULL
      );
      INSERT INTO schema_version (id, version) VALUES (1, 30);
      CREATE TABLE sync_operations (
        operation_id TEXT PRIMARY KEY,
        scope TEXT NOT NULL,
        resource TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        payload TEXT NOT NULL,
        expected_revision INTEGER,
        state TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TEXT NOT NULL,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE UNIQUE INDEX idx_sync_operations_entity
        ON sync_operations (scope, resource, entity_id);
      INSERT INTO sync_operations
        (operation_id, scope, resource, entity_id, kind, payload, state, next_attempt_at, created_at, updated_at)
      VALUES
        ('operation-1', 'cloud:user:org', 'brain-file', 'notes/example.md', 'write', '{}', 'pending', datetime('now'), datetime('now'), datetime('now'));
    `);

    initSchema(db);

    expect(
      db.prepare("SELECT version FROM schema_version WHERE id = 1").get(),
    ).toEqual({ version: 31 });
    expect(
      db
        .prepare(
          "SELECT sequence FROM sync_operations WHERE operation_id = 'operation-1'",
        )
        .get(),
    ).toEqual({ sequence: 0 });
    expect(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_sync_operations_entity'",
        )
        .get(),
    ).toBeUndefined();
    db.close();
  });
});
