import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { applyDictionaryReplacements } from "../src/lib/dictionary-replacements.js";

function testDb(): DatabaseSync {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE dictionary (
      id INTEGER PRIMARY KEY,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      usage_count INTEGER NOT NULL DEFAULT 0
    );
  `);
  return db;
}

describe("applyDictionaryReplacements", () => {
  it("replaces whole words and increments usage_count", () => {
    const db = testDb();
    db.prepare("INSERT INTO dictionary (key, value) VALUES (?, ?)").run(
      "freestyle",
      "Freestyle",
    );

    const result = applyDictionaryReplacements(
      "we use freestyle for dictation",
      db,
    );

    expect(result).toBe("we use Freestyle for dictation");
    const count = db
      .prepare("SELECT usage_count FROM dictionary WHERE key = ?")
      .get("freestyle") as { usage_count: number };
    expect(count.usage_count).toBe(1);
  });

  it("replaces Chinese phrases inside running text", () => {
    const db = testDb();
    db.prepare("INSERT INTO dictionary (key, value) VALUES (?, ?)").run(
      "旧金山",
      "San Francisco",
    );

    const result = applyDictionaryReplacements("我们改去旧金山开会", db);

    expect(result).toBe("我们改去San Francisco开会");
  });

  it("does not replace latin keys inside larger words", () => {
    const db = testDb();
    db.prepare("INSERT INTO dictionary (key, value) VALUES (?, ?)").run(
      "cat",
      "dog",
    );

    const result = applyDictionaryReplacements("concatenate the cat", db);

    expect(result).toBe("concatenate the dog");
  });
});
