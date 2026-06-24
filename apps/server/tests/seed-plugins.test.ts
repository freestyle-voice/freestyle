import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { initSchema } from "../src/lib/schema.js";

function readSetting(db: DatabaseSync, key: string): string | undefined {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

describe("plugins setting on a fresh database", () => {
  it("does not seed any plugins (install is explicit, via the catalog)", () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);

    expect(readSetting(db, "plugins")).toBeUndefined();
  });

  it("never overwrites a user-configured plugins setting", () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);

    db.prepare(
      "INSERT INTO settings (key, value, updated_at) VALUES ('plugins', ?, datetime('now'))",
    ).run(JSON.stringify(["@acme/plugin-x"]));

    initSchema(db);

    expect(JSON.parse(readSetting(db, "plugins") as string)).toEqual([
      "@acme/plugin-x",
    ]);
  });
});
