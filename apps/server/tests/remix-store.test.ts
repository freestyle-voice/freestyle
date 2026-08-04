import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../src/lib/db.js";
import {
  getActiveThread,
  getThreadMessages,
  MAX_THREAD_MESSAGES,
  purgeExpiredRemixData,
  recordRemixRun,
  saveThreadMessages,
  startNewThread,
} from "../src/lib/remix-store.js";

function message(id: string) {
  return { id, role: "user", parts: [{ type: "text", text: id }] };
}

function ageThread(threadId: number, days: number): void {
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
    expect(getActiveThread()).toBeNull();
    const count = getDb()
      .prepare("SELECT COUNT(*) AS n FROM remix_threads")
      .get() as { n: number };
    expect(count.n).toBe(0);
  });

  it("returns a fresh thread and ignores an idle one", () => {
    const thread = startNewThread();
    expect(getActiveThread()?.id).toBe(thread.id);

    ageThread(thread.id, 1);
    expect(getActiveThread()).toBeNull();
  });
});

describe("saveThreadMessages", () => {
  it("returns false for a thread that does not exist", () => {
    expect(saveThreadMessages(9999, [message("a")])).toBe(false);
  });

  it("is a true snapshot: rows absent from the sync are deleted", () => {
    const thread = startNewThread();
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
    const thread = startNewThread();
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
    const oldThread = startNewThread();
    saveThreadMessages(oldThread.id, [message("old")]);
    ageThread(oldThread.id, 40);

    const freshThread = startNewThread();
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
    const thread = startNewThread();
    expect(purgeExpiredRemixData(30)).toBe(0);
    expect(
      getDb()
        .prepare("SELECT id FROM remix_threads WHERE id = ?")
        .get(thread.id),
    ).toBeDefined();
  });
});
