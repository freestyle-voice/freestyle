import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb } from "../src/lib/db.js";
import { freestyleCloudUrl } from "../src/lib/freestyle-cloud.js";
import { flushRemixCancels } from "../src/lib/remix-cancel-outbox.js";
import {
  drainRemixQueues,
  enqueueRemixMessage,
  pauseRemixQueue,
  registerRemixTurn,
  remixQueueSnapshot,
  removeRemixQueuedMessage,
  settleRemixTurn,
  steerRemixQueuedMessage,
  updateRemixQueuedMessage,
} from "../src/lib/remix-durable-queue.js";
import { clearSession, setSession } from "../src/lib/sessions.js";

beforeEach(() =>
  setSession({
    token: "test-token",
    user: { id: crypto.randomUUID(), email: "test@example.test" },
    host: freestyleCloudUrl(),
  }),
);
afterEach(() => {
  clearSession();
  vi.unstubAllGlobals();
});
describe("server-owned durable Remix follow-ups", () => {
  it("deduplicates local enqueue receipts, including after the item left the queue", () => {
    const requestId = crypto.randomUUID();
    enqueueRemixMessage("thread-a", { requestId, text: "Once" });
    closeDb();
    enqueueRemixMessage("thread-a", { requestId, text: "Once" });
    expect(remixQueueSnapshot("thread-a").items).toHaveLength(1);
    removeRemixQueuedMessage("thread-a", requestId);
    enqueueRemixMessage("thread-a", { requestId, text: "Once" });
    expect(remixQueueSnapshot("thread-a").items).toHaveLength(0);
    enqueueRemixMessage("thread-a", {
      requestId: crypto.randomUUID(),
      text: "Once",
    });
    expect(remixQueueSnapshot("thread-a").items).toHaveLength(1);
  });
  it("admits an unblocked orphaned queued message without a renderer observer", async () => {
    enqueueRemixMessage("thread-a", { text: "Follow up" });
    const requests: Array<{ url: string; body?: Record<string, unknown> }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        requests.push({ url, body });
        if (url.endsWith("threads/thread-a"))
          return Response.json({ thread: { messages: [] } });
        return Response.json({ turn: { id: "turn-b" } });
      }),
    );

    await drainRemixQueues();

    expect(remixQueueSnapshot("thread-a")).toMatchObject({
      items: [],
      activeTurnId: "turn-b",
    });
    expect(
      requests.find((request) => request.url.endsWith("remix/turns"))?.body
        ?.clientRequestId,
    ).toBeTruthy();
  });
  it("replays headless retryable admissions with a bounded persisted budget", async () => {
    const request = {
      threadId: "thread-a",
      clientRequestId: "request-a",
      messages: [],
      context: {},
    };
    registerRemixTurn("thread-a", "turn-a", request);
    enqueueRemixMessage("thread-a", { text: "Next" });
    const posts: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.body) posts.push(String(init.body));
        return Response.json({ turn: { id: "turn-a", status: "retryable" } });
      }),
    );
    await drainRemixQueues();
    for (const delay of [3_000, 6_000, 12_000, 24_000, 30_000]) {
      closeDb();
      vi.setSystemTime(Date.now() + delay);
      await drainRemixQueues();
      await drainRemixQueues();
    }
    expect(posts).toEqual(Array(5).fill(JSON.stringify(request)));
    expect(remixQueueSnapshot("thread-a").recoveryPaused).toBe(true);
    await drainRemixQueues();
    expect(posts).toHaveLength(5);
    expect(remixQueueSnapshot("thread-a").items[0].text).toBe("Next");
  });
  it("backs off ordinary transport failures and pauses after five reconnects", async () => {
    registerRemixTurn("thread-a", "turn-a", {
      threadId: "thread-a",
      clientRequestId: "request-a",
      messages: [],
      context: {},
    });
    const fetch = vi.fn(async () => {
      throw new TypeError("offline");
    });
    vi.stubGlobal("fetch", fetch);
    await drainRemixQueues();
    await drainRemixQueues();
    expect(fetch).toHaveBeenCalledOnce();
    for (const delay of [3_000, 6_000, 12_000, 24_000, 30_000]) {
      vi.setSystemTime(Date.now() + delay);
      await drainRemixQueues();
    }
    expect(fetch).toHaveBeenCalledTimes(6);
    expect(remixQueueSnapshot("thread-a").recoveryPaused).toBe(true);
    vi.setSystemTime(Date.now() + 30_000);
    await drainRemixQueues();
    expect(fetch).toHaveBeenCalledTimes(6);
    // A fresh visible Resume/new turn receives its own retry budget.
    registerRemixTurn("thread-a", "turn-b");
    await drainRemixQueues();
    expect(fetch).toHaveBeenCalledTimes(7);
    expect(remixQueueSnapshot("thread-a").recoveryPaused).toBe(false);
  });
  it("continues the next follow-up after headless retryable recovery succeeds", async () => {
    const request = {
      threadId: "thread-a",
      clientRequestId: "request-a",
      messages: [],
      context: {},
    };
    registerRemixTurn("thread-a", "turn-a", request);
    enqueueRemixMessage("thread-a", { text: "Next" });
    let status = "retryable";
    const posts: Record<string, unknown>[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.body) {
          const body = JSON.parse(String(init.body));
          posts.push(body);
          if (body.clientRequestId === "request-a") status = "completed";
          return Response.json({
            turn: {
              id: body.clientRequestId === "request-a" ? "turn-a" : "turn-b",
            },
          });
        }
        return url.includes("/threads/")
          ? Response.json({ thread: { messages: [] } })
          : Response.json({ turn: { status } });
      }),
    );
    await drainRemixQueues();
    vi.setSystemTime(Date.now() + 3_000);
    await drainRemixQueues();
    closeDb();
    await drainRemixQueues();
    expect(posts[0]).toEqual(request);
    expect(posts).toHaveLength(2);
    expect(remixQueueSnapshot("thread-a")).toMatchObject({
      items: [],
      activeTurnId: "turn-b",
    });
  });
  it("does not replay a retryable receipt when Stop pauses during observation", async () => {
    registerRemixTurn("thread-a", "turn-a", {
      threadId: "thread-a",
      clientRequestId: "request-a",
      messages: [],
      context: {},
    });
    let stopDuringRead = false;
    const posts: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.body) posts.push(init.body);
        else if (stopDuringRead) pauseRemixQueue("thread-a");
        return Response.json({ turn: { id: "turn-a", status: "retryable" } });
      }),
    );
    await drainRemixQueues();
    vi.setSystemTime(Date.now() + 3_000);
    stopDuringRead = true;
    await drainRemixQueues();
    expect(posts).toEqual([]);
    expect(remixQueueSnapshot("thread-a").active).toBe(false);
  });
  it("recovers a lost queued receipt to honor Stop after both renderers close", async () => {
    registerRemixTurn("thread-a", "turn-a");
    enqueueRemixMessage("thread-a", { text: "Follow up" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("turn-a"))
          return Response.json({ turn: { status: "completed" } });
        if (url.endsWith("threads/thread-a"))
          return Response.json({ thread: { messages: [] } });
        throw new Error("lost queued receipt");
      }),
    );
    await drainRemixQueues();
    pauseRemixQueue("thread-a");
    closeDb();
    const fetch = vi.fn(async (url: string) =>
      url.endsWith("remix/turns")
        ? Response.json({ turn: { id: "turn-b" } })
        : Response.json({ receipt: { canceled: true } }),
    );
    vi.stubGlobal("fetch", fetch);
    await flushRemixCancels();
    expect(fetch.mock.calls.map(([url]) => url)).toEqual([
      `${freestyleCloudUrl()}/v2/remix/turns`,
      `${freestyleCloudUrl()}/v2/remix/turns/turn-b/commands`,
    ]);
    expect(remixQueueSnapshot("thread-a").items[0].text).toBe("Follow up");
    const draft = remixQueueSnapshot("thread-a").items[0];
    expect(
      updateRemixQueuedMessage("thread-a", draft.id, "Edited follow-up"),
    ).toBe(true);
    expect(steerRemixQueuedMessage("thread-a", draft.id)).toBe(true);
    expect(removeRemixQueuedMessage("thread-a", draft.id)).toBe(true);
  });
  it("drains a follow-up after both renderers close and after a database reopen", async () => {
    registerRemixTurn("thread-a", "turn-a");
    enqueueRemixMessage("thread-a", { text: "Follow up" });
    closeDb();
    const requests: Array<{ url: string; body?: Record<string, unknown> }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        requests.push({ url, body });
        if (url.endsWith("turn-a"))
          return Response.json({ turn: { status: "completed" } });
        if (url.endsWith("threads/thread-a"))
          return Response.json({
            thread: {
              messages: [
                {
                  id: "assistant-a",
                  role: "assistant",
                  parts: [{ type: "text", text: "Done" }],
                },
              ],
            },
          });
        return Response.json({ turn: { id: "turn-b" } });
      }),
    );
    await drainRemixQueues();
    expect(remixQueueSnapshot("thread-a")).toMatchObject({
      items: [],
      activeTurnId: "turn-b",
    });
    const admitted = requests.find((request) =>
      request.url.endsWith("remix/turns"),
    )!.body!;
    expect(
      (admitted.messages as Array<{ parts: unknown }>).at(-1)?.parts,
    ).toEqual([{ type: "text", text: "Follow up" }]);
    expect(admitted.clientRequestId).toBeTruthy();
  });
  it("replays the same queued admission after its receipt response is lost", async () => {
    registerRemixTurn("thread-a", "turn-a");
    enqueueRemixMessage("thread-a", { text: "Follow up" });
    const bodies: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith("turn-a"))
          return Response.json({ turn: { status: "completed" } });
        if (url.endsWith("threads/thread-a"))
          return Response.json({ thread: { messages: [] } });
        bodies.push(String(init?.body));
        if (bodies.length === 1) throw new Error("lost receipt");
        return Response.json({ turn: { id: "turn-b" } });
      }),
    );
    await drainRemixQueues();
    expect(remixQueueSnapshot("thread-a").items).toHaveLength(1);
    closeDb();
    vi.setSystemTime(Date.now() + 3_000);
    await drainRemixQueues();
    expect(bodies).toHaveLength(2);
    expect(bodies[1]).toBe(bodies[0]);
    expect(remixQueueSnapshot("thread-a").items).toHaveLength(0);
  });
  it.each([
    "failed",
    "canceled",
  ])("preserves queued follow-ups after %s", async (status) => {
    registerRemixTurn("thread-a", "turn-a");
    enqueueRemixMessage("thread-a", { text: "Follow up" });
    settleRemixTurn("turn-a", status);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await drainRemixQueues();
    expect(fetch).not.toHaveBeenCalled();
    expect(remixQueueSnapshot("thread-a").items[0].text).toBe("Follow up");
  });
});
