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
  settleRemixTurn,
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
