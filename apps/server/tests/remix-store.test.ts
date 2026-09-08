import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../src/lib/db.js";
import {
  createRemixThread,
  getActiveThread,
  getThreadMessages,
  MAX_THREAD_MESSAGES,
  purgeExpiredRemixData,
  recordRemixRun,
  saveThreadMessages,
} from "../src/lib/remix-store.js";

const localModel = {
  provider: "local-llm",
  modelId: "local-llm/qwen",
  modelName: "Qwen",
};

function message(id: string) {
  return { id, role: "user", parts: [{ type: "text", text: id }] };
}

function ageThread(threadId: string, days: number): void {
  getDb()
    .prepare(
      "UPDATE remix_threads SET last_active_at = datetime('now', ?) WHERE id = ?",
    )
    .run(`-${days} days`, threadId);
}

beforeEach(() => {
  const db = getDb();
  db.exec("DELETE FROM remix_messages");
  db.exec("DELETE FROM remix_runs");
  db.exec("DELETE FROM remix_threads");
});

describe("getActiveThread", () => {
  it("returns null instead of creating a thread", () => {
    expect(getActiveThread("local")).toBeNull();
    const count = getDb()
      .prepare("SELECT COUNT(*) AS n FROM remix_threads")
      .get() as { n: number };
    expect(count.n).toBe(0);
  });

  it("returns a fresh thread and ignores an idle one", () => {
    const thread = createRemixThread("local", localModel);
    expect(getActiveThread("local")?.id).toBe(thread.id);

    ageThread(thread.id, 1);
    expect(getActiveThread("local")).toBeNull();
  });
});

describe("Remix thread identity", () => {
  it("requires an explicit session type and uses UUID thread IDs", () => {
    const thread = createRemixThread("local", localModel);

    expect(thread).toMatchObject({ type: "local" });
    expect(thread.id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    expect(
      getDb().prepare("PRAGMA table_info(remix_threads)").all(),
    ).toContainEqual(
      expect.objectContaining({ name: "type", notnull: 1, dflt_value: null }),
    );
  });

  it("migrates integer local history to UUID local sessions without losing rows", () => {
    const db = new DatabaseSync(":memory:");
    db.exec(`
      CREATE TABLE schema_version (id INTEGER PRIMARY KEY CHECK(id = 1), version INTEGER NOT NULL);
      INSERT INTO schema_version (id, version) VALUES (1, 29);
      CREATE TABLE remix_threads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        created_at TEXT NOT NULL,
        last_active_at TEXT NOT NULL
      );
      CREATE TABLE remix_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        thread_id INTEGER NOT NULL,
        message_id TEXT NOT NULL,
        ui_message TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(thread_id, message_id)
      );
      CREATE TABLE remix_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        thread_id INTEGER,
        lane TEXT NOT NULL,
        instruction TEXT NOT NULL,
        before_text TEXT,
        after_text TEXT NOT NULL,
        app_name TEXT,
        llm_provider TEXT,
        llm_model TEXT,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cost_usd REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      INSERT INTO remix_threads (id, created_at, last_active_at) VALUES (7, '2026-01-01', '2026-01-02');
      INSERT INTO remix_messages (thread_id, message_id, ui_message, created_at) VALUES (7, 'message-1', '{"id":"message-1"}', '2026-01-01');
      INSERT INTO remix_runs (thread_id, lane, instruction, after_text, created_at) VALUES (7, 'agent', 'help', 'done', '2026-01-01');
    `);

    // The production schema migration is imported lazily so this fixture does
    // not share the test process's application database.
    return import("../src/lib/schema.js").then(({ initSchema }) => {
      initSchema(db);
      const thread = db.prepare("SELECT id, type FROM remix_threads").get() as {
        id: string;
        type: string;
      };
      expect(thread.type).toBe("local");
      expect(thread.id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(db.prepare("SELECT thread_id FROM remix_messages").get()).toEqual({
        thread_id: thread.id,
      });
      expect(db.prepare("SELECT thread_id FROM remix_runs").get()).toEqual({
        thread_id: thread.id,
      });
      db.close();
    });
  });
});

describe("saveThreadMessages", () => {
  it("returns false for a thread that does not exist", () => {
    expect(saveThreadMessages(9999, [message("a")])).toBe(false);
  });

  it("is a true snapshot: rows absent from the sync are deleted", () => {
    const thread = createRemixThread("local", localModel);
    expect(
      saveThreadMessages(thread.id, [message("a"), message("b"), message("c")]),
    ).toBe(true);
    expect(getThreadMessages(thread.id).map((m) => m.id)).toEqual([
      "a",
      "b",
      "c",
    ]);

    saveThreadMessages(thread.id, [message("a"), message("c")]);
    expect(getThreadMessages(thread.id).map((m) => m.id)).toEqual(["a", "c"]);
  });

  it("keeps only the newest MAX_THREAD_MESSAGES rows", () => {
    const thread = createRemixThread("local", localModel);
    const batch = Array.from({ length: MAX_THREAD_MESSAGES + 10 }, (_, i) =>
      message(`m${i}`),
    );
    saveThreadMessages(thread.id, batch);

    const stored = getThreadMessages(thread.id);
    expect(stored).toHaveLength(MAX_THREAD_MESSAGES);
    expect(stored[0].id).toBe("m10");
    expect(stored[stored.length - 1].id).toBe(`m${MAX_THREAD_MESSAGES + 9}`);
  });
});

describe("recordRemixRun", () => {
  it("returns the inserted row id", () => {
    const id = recordRemixRun({
      lane: "transform",
      instruction: "Fix it.",
      afterText: "done",
    });
    const row = getDb()
      .prepare("SELECT id FROM remix_runs WHERE id = ?")
      .get(id) as { id: number } | undefined;
    expect(row?.id).toBe(id);
  });
});

describe("purgeExpiredRemixData", () => {
  it("deletes runs and idle threads older than the window, cascading messages", () => {
    const oldThread = createRemixThread("local", localModel);
    saveThreadMessages(oldThread.id, [message("old")]);
    ageThread(oldThread.id, 40);

    const freshThread = createRemixThread("local", localModel);
    saveThreadMessages(freshThread.id, [message("fresh")]);

    const oldRun = recordRemixRun({
      lane: "transform",
      instruction: "old",
      afterText: "x",
    });
    getDb()
      .prepare(
        "UPDATE remix_runs SET created_at = datetime('now', '-40 days') WHERE id = ?",
      )
      .run(oldRun);
    const freshRun = recordRemixRun({
      lane: "transform",
      instruction: "fresh",
      afterText: "y",
    });

    const deleted = purgeExpiredRemixData(30);
    expect(deleted).toBe(2);

    const db = getDb();
    expect(
      db.prepare("SELECT id FROM remix_threads WHERE id = ?").get(oldThread.id),
    ).toBeUndefined();
    expect(
      db
        .prepare("SELECT id FROM remix_messages WHERE thread_id = ?")
        .get(oldThread.id),
    ).toBeUndefined();
    expect(
      db
        .prepare("SELECT id FROM remix_threads WHERE id = ?")
        .get(freshThread.id),
    ).toBeDefined();
    expect(
      db.prepare("SELECT id FROM remix_runs WHERE id = ?").get(oldRun),
    ).toBeUndefined();
    expect(
      db.prepare("SELECT id FROM remix_runs WHERE id = ?").get(freshRun),
    ).toBeDefined();
  });

  it("never deletes the active thread", () => {
    const thread = createRemixThread("local", localModel);
    expect(purgeExpiredRemixData(30)).toBe(0);
    expect(
      getDb()
        .prepare("SELECT id FROM remix_threads WHERE id = ?")
        .get(thread.id),
    ).toBeDefined();
  });
});
