import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { initSchema } from "../src/lib/schema.js";

describe("legacy Models migration", () => {
  it("restores the desktop-only API key table for an existing v27 database", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE schema_version (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        version INTEGER NOT NULL
      );
      INSERT INTO schema_version (id, version) VALUES (1, 27);
    `);

    initSchema(db);

    expect(
      db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'api_keys'",
        )
        .get(),
    ).toEqual({ name: "api_keys" });
    expect(db.prepare("PRAGMA table_info(api_keys)").all()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "provider", pk: 1 }),
        expect.objectContaining({ name: "key" }),
        expect.objectContaining({ name: "status" }),
      ]),
    );
    db.close();
  });
});
