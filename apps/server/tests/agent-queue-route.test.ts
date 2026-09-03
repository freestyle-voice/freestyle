import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/freestyle-cloud.js", () => ({
  DEFAULT_CLOUD_URL: "https://service.freestylevoice.com",
  freestyleCloudUrl: () => "https://cloud.test",
}));

import { agentMessageQueue } from "../src/lib/agent-message-queue.js";
import { agentStreamStore } from "../src/lib/agent-stream-store.js";
import { clearSession, setSession } from "../src/lib/sessions.js";
import agentRoute from "../src/routes/agent.js";

const encoder = new TextEncoder();

function session(): void {
  setSession({
    token: "cloud-session",
    user: { id: "user-1", email: "user@example.com" },
    host: "https://cloud.test",
  });
}

function activeResponse() {
  return new Response(
    new ReadableStream<Uint8Array>({
      start() {
        // Keep the source alive until an explicit steer cancels it.
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
}

describe("agent queue route", () => {
  afterEach(() => {
    agentStreamStore.clear();
    agentMessageQueue.clear();
    clearSession();
    vi.unstubAllGlobals();
  });

  it("keeps queued follow-ups local and allows edit/remove before dispatch", async () => {
    session();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(activeResponse()));

    const start = await agentRoute.request("/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        threadId: "thread-1",
        messages: [{ id: "first", role: "user", parts: [] }],
      }),
    });
    expect(start.status).toBe(200);

    const queued = await agentRoute.request("/thread-1/queue", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "Follow up" }),
    });
    expect(queued.status).toBe(201);
    const payload = (await queued.json()) as {
      item: { id: string };
      items: Array<{ text: string }>;
      active: boolean;
    };
    expect(payload).toMatchObject({
      active: true,
      items: [{ text: "Follow up" }],
    });

    const edited = await agentRoute.request(
      `/thread-1/queue/${payload.item.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "Edited follow-up" }),
      },
    );
    await expect(edited.json()).resolves.toMatchObject({
      items: [{ text: "Edited follow-up" }],
    });

    const removed = await agentRoute.request(
      `/thread-1/queue/${payload.item.id}`,
      {
        method: "DELETE",
      },
    );
    await expect(removed.json()).resolves.toEqual({ items: [], active: true });
  });

  it("provides one payload-free activity snapshot for active queued sessions", async () => {
    session();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(activeResponse()));

    await agentRoute.request("/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        threadId: "thread-activity",
        messages: [{ id: "first", role: "user", parts: [] }],
      }),
    });
    await agentRoute.request("/thread-activity/queue", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "Follow up when ready" }),
    });

    const activity = await agentRoute.request("/activity");
    expect(activity.status).toBe(200);
    await expect(activity.json()).resolves.toEqual({
      threads: [
        {
          threadId: "thread-activity",
          active: true,
          queuedCount: 1,
        },
      ],
    });
  });

  it("pushes activity changes over one local event stream", async () => {
    session();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(activeResponse()));

    const response = await agentRoute.request("/activity/stream", {
      headers: { Accept: "text/event-stream" },
    });
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const reader = response.body?.getReader();
    expect(reader).toBeDefined();

    const decoder = new TextDecoder();
    const initial = await reader!.read();
    expect(decoder.decode(initial.value)).toContain(
      'data: {"threads":[],"changedThreadId":null}',
    );

    await agentRoute.request("/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        threadId: "thread-stream",
        messages: [{ id: "first", role: "user", parts: [] }],
      }),
    });

    const changed = await reader!.read();
    expect(decoder.decode(changed.value)).toContain(
      '"threadId":"thread-stream","active":true,"queuedCount":0',
    );
    await reader!.cancel();
  });

  it("steers by cancelling the current local stream before starting the queued turn", async () => {
    session();
    const initial = activeResponse();
    const next = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode("data: queued\n\n"));
        },
      }),
      { headers: { "content-type": "text/event-stream" } },
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(initial)
      .mockResolvedValueOnce(next);
    vi.stubGlobal("fetch", fetchMock);

    await agentRoute.request("/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        threadId: "thread-1",
        messages: [{ id: "first", role: "user", parts: [] }],
      }),
    });
    const queued = await agentRoute.request("/thread-1/queue", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "Change direction" }),
    });
    const item = ((await queued.json()) as { item: { id: string } }).item;

    const steered = await agentRoute.request(
      `/thread-1/queue/${item.id}/steer`,
      {
        method: "POST",
      },
    );
    expect(steered.status).toBe(200);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const forwarded = JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string);
    expect(forwarded).toMatchObject({
      threadId: "thread-1",
      messages: [
        { id: "first", role: "user" },
        { role: "user", parts: [{ type: "text", text: "Change direction" }] },
      ],
    });
  });

  it("starts the next queued message after the completed Cloud thread is persisted", async () => {
    session();
    let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
    const first = new Response(
      new ReadableStream<Uint8Array>({
        start(source) {
          controller = source;
        },
      }),
      { headers: { "content-type": "text/event-stream" } },
    );
    const next = new Response(new ReadableStream<Uint8Array>(), {
      headers: { "content-type": "text/event-stream" },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            thread: {
              messages: [
                { id: "first", role: "user", parts: [] },
                { id: "answer", role: "assistant", parts: [] },
              ],
            },
          }),
          { headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(next);
    vi.stubGlobal("fetch", fetchMock);

    await agentRoute.request("/", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        threadId: "thread-1",
        messages: [{ id: "first", role: "user", parts: [] }],
      }),
    });
    await agentRoute.request("/thread-1/queue", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "And now compare it" }),
    });

    controller?.close();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://cloud.test/v2/threads/thread-1",
    );
    const forwarded = JSON.parse(fetchMock.mock.calls[2]?.[1]?.body as string);
    expect(forwarded.messages).toMatchObject([
      { id: "first", role: "user" },
      { id: "answer", role: "assistant" },
      { role: "user", parts: [{ type: "text", text: "And now compare it" }] },
    ]);
  });
});
