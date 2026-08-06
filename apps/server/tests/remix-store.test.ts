import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../src/lib/db.js";
import {
  getActiveThread,
  getThread,
  getThreadMessages,
  listThreads,
  MAX_THREAD_MESSAGES,
  purgeExpiredRemixData,
  recordRemixRun,
  saveThreadMessages,
  startNewThread,
} from "../src/lib/remix-store.js";

function message(id: string) {
  return { id, role: "user", parts: [{ type: "text", text: id }] };
}

function userMessage(id: string, text: string) {
  return { id, role: "user", parts: [{ type: "text", text }] };
}

function assistantToolMessage(id: string, toolName: string) {
  return {
    id,
    role: "assistant",
    parts: [{ type: `tool-${toolName}`, toolName, state: "output-available" }],
  };
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

describe("listThreads", () => {
  it("omits threads with no messages", () => {
    startNewThread(); // empty, should not appear
    const withMessages = startNewThread();
    saveThreadMessages(withMessages.id, [userMessage("a", "Hello there")]);

    const threads = listThreads(50, 0);
    expect(threads).toHaveLength(1);
    expect(threads[0].id).toBe(withMessages.id);
    expect(threads[0].preview).toBe("Hello there");
    expect(threads[0].messageCount).toBe(1);
  });

  it("orders by last_active_at descending", () => {
    const older = startNewThread();
    saveThreadMessages(older.id, [userMessage("a", "older")]);
    ageThread(older.id, 2);

    const newer = startNewThread();
    saveThreadMessages(newer.id, [userMessage("b", "newer")]);

    const threads = listThreads(50, 0);
    expect(threads.map((t) => t.id)).toEqual([newer.id, older.id]);
  });

  it("truncates a long preview to 120 chars with an ellipsis", () => {
    const thread = startNewThread();
    const long = "x".repeat(200);
    saveThreadMessages(thread.id, [userMessage("a", long)]);

    const [summary] = listThreads(50, 0);
    expect(summary.preview.endsWith("…")).toBe(true);
    // 120 chars of content + the ellipsis character.
    expect([...summary.preview]).toHaveLength(121);
  });

  it("derives the preview from the first user message only", () => {
    const thread = startNewThread();
    saveThreadMessages(thread.id, [
      userMessage("a", "The instruction"),
      assistantToolMessage("b", "paste"),
    ]);

    const [summary] = listThreads(50, 0);
    expect(summary.preview).toBe("The instruction");
    expect(summary.messageCount).toBe(2);
  });

  it("paginates with limit and offset", () => {
    const ids: number[] = [];
    for (let i = 0; i < 5; i++) {
      const thread = startNewThread();
      saveThreadMessages(thread.id, [userMessage(`m${i}`, `msg ${i}`)]);
      ageThread(thread.id, 5 - i); // ensure a stable, distinct ordering
      ids.push(thread.id);
    }
    // Newest-first ordering means the least-aged (i=4) comes first.
    const ordered = [...ids].reverse();

    const firstPage = listThreads(2, 0);
    expect(firstPage.map((t) => t.id)).toEqual(ordered.slice(0, 2));

    const secondPage = listThreads(2, 2);
    expect(secondPage.map((t) => t.id)).toEqual(ordered.slice(2, 4));

    const thirdPage = listThreads(2, 4);
    expect(thirdPage.map((t) => t.id)).toEqual(ordered.slice(4, 5));
  });
});

describe("getThread", () => {
  it("returns null for a thread that does not exist", () => {
    expect(getThread(9999)).toBeNull();
  });

  it("returns the thread and its messages", () => {
    const thread = startNewThread();
    saveThreadMessages(thread.id, [
      userMessage("a", "hi"),
      assistantToolMessage("b", "paste"),
    ]);

    const found = getThread(thread.id);
    expect(found?.thread.id).toBe(thread.id);
    expect(found?.messages.map((m) => m.id)).toEqual(["a", "b"]);
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
