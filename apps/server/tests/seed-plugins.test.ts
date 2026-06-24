import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { initSchema } from "../src/lib/schema.js";

function readSetting(db: DatabaseSync, key: string): string | undefined {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

describe("seedDefaultPlugins (via initSchema)", () => {
  it("seeds the default plugins setting on a fresh database", () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);

    const value = readSetting(db, "plugins");
    expect(value).toBeDefined();
    expect(JSON.parse(value as string)).toContain(
      "@freestyle/plugin-audio-transcription",
    );
  });

  it("never overwrites a user-configured plugins setting", () => {
    const db = new DatabaseSync(":memory:");
    initSchema(db);

    // Simulate a user who removed every plugin.
    db.prepare("UPDATE settings SET value = ? WHERE key = 'plugins'").run(
      JSON.stringify([]),
    );

    // Re-running init (e.g. on the next boot / a migration) must preserve it.
    initSchema(db);

    expect(JSON.parse(readSetting(db, "plugins") as string)).toEqual([]);
  });
});
