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

  it("inserts replacement values containing $ patterns literally", () => {
    const db = testDb();
    const insert = db.prepare(
      "INSERT INTO dictionary (key, value) VALUES (?, ?)",
    );
    insert.run("price", "$&/month");
    insert.run("cash", "A$$B");
    insert.run("prefix", "$` and $' and $1");

    expect(applyDictionaryReplacements("the price is low", db)).toBe(
      "the $&/month is low",
    );
    expect(applyDictionaryReplacements("bring cash today", db)).toBe(
      "bring A$$B today",
    );
    expect(applyDictionaryReplacements("add a prefix here", db)).toBe(
      "add a $` and $' and $1 here",
    );
  });

  it("increments usage_count for all matched entries in one pass", () => {
    const db = testDb();
    const insert = db.prepare(
      "INSERT INTO dictionary (key, value) VALUES (?, ?)",
    );
    insert.run("foo", "FOO");
    insert.run("bar", "BAR");
    insert.run("unused", "UNUSED");

    const result = applyDictionaryReplacements("foo and bar", db);

    expect(result).toBe("FOO and BAR");
    const rows = db
      .prepare("SELECT key, usage_count FROM dictionary ORDER BY key")
      .all() as { key: string; usage_count: number }[];
    expect(rows).toEqual([
      { key: "bar", usage_count: 1 },
      { key: "foo", usage_count: 1 },
      { key: "unused", usage_count: 0 },
    ]);
  });

  it("reuses cached regexes across calls without stale results", () => {
    const db = testDb();
    db.prepare("INSERT INTO dictionary (key, value) VALUES (?, ?)").run(
      "brb",
      "be right back",
    );

    expect(applyDictionaryReplacements("brb in five", db)).toBe(
      "be right back in five",
    );
    // Second call exercises the cached regex; global-flag state must not leak.
    expect(applyDictionaryReplacements("brb brb", db)).toBe(
      "be right back be right back",
    );
  });
});
