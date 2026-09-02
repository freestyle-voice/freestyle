import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/sessions.js", () => ({
  getSessionToken: () => "token",
  invalidateSession: vi.fn(),
}));

vi.mock("../src/lib/freestyle-cloud.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/freestyle-cloud.js")>()),
  freestyleCloudUrl: () => "https://cloud.test",
}));

import { agentStreamStore } from "../src/lib/agent-stream-store.js";
import agentThreadsRoute from "../src/routes/agent-threads.js";
import routes from "../src/routes/index.js";

describe("agent thread list proxy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    agentStreamStore.clear();
  });

  it("forwards origin, limit and cursor to the cloud", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ threads: [], nextCursor: null }), {
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await agentThreadsRoute.request(
      "/list?limit=24&cursor=1700000000000&origin=user&junk=1",
    );
    expect(res.status).toBe(200);
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe("/v2/threads");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      origin: "user",
      limit: "24",
      cursor: "1700000000000",
    });
  });

  it("reserves list and latest before the generic thread snapshot route", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ threads: [], nextCursor: null }), {
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await routes.request("/api/agent/thread/list?origin=user");

    expect(res.status).toBe(200);
    expect(new URL(fetchMock.mock.calls[0][0] as string).pathname).toBe(
      "/v2/threads",
    );

    const latest = await routes.request("/api/agent/thread/latest");

    expect(latest.status).toBe(200);
    expect(new URL(fetchMock.mock.calls[1][0] as string).pathname).toBe(
      "/v2/threads/latest",
    );
  });

  it("accepts a durable turn through the server-owned Cloud session", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ turn: { id: "turn-1" } }), {
          status: 202,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const payload = {
      clientRequestId: "desktop-request-123",
      messages: [{ id: "message-1", role: "user", parts: [] }],
      client: { platform: "ios", localTools: [] },
    };

    const res = await agentThreadsRoute.request("/thread-one/turns", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(202);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://cloud.test/v2/threads/thread-one/turns",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer token" }),
      }),
    );
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(sent).toMatchObject({
      clientRequestId: "desktop-request-123",
      messages: payload.messages,
      client: {
        platform: process.platform,
        supportsDownloadsSave: true,
        supportsCursorActions: true,
      },
      mcpTools: [],
    });
    expect(sent.client.localTools).toContain("Bash");
  });

  it("proxies reconnectable durable snapshots without converting them to JSON", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response('event: snapshot\ndata: {"activeTurn":null}\n\n', {
          headers: { "content-type": "text/event-stream; charset=utf-8" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await agentThreadsRoute.request("/thread-one/stream");

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    await expect(res.text()).resolves.toContain("event: snapshot");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://cloud.test/v2/threads/thread-one/stream",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer token" }),
      }),
    );
  });

  it("supplies the local message base while a Cloud thread is still streaming", async () => {
    const source = new ReadableStream<Uint8Array>();
    agentStreamStore.start(
      "thread-one",
      [{ id: "message-1", role: "user", parts: [] }],
      source,
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: "Thread not found." }), {
            status: 404,
            headers: { "content-type": "application/json" },
          }),
      ),
    );

    const response = await agentThreadsRoute.request("/thread-one");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      error: "Thread not found.",
      thread: {
        id: "thread-one",
        messages: [{ id: "message-1", role: "user", parts: [] }],
      },
    });
  });
});
