import { describe, expect, it, vi } from "vitest";
import {
  consumeNotificationEvents,
  notificationStreamUrl,
  startNotificationStream,
} from "./notification-stream";

describe("notificationStreamUrl", () => {
  it("adds the notifications stream path without a duplicate slash", () => {
    expect(notificationStreamUrl("http://127.0.0.1:4649/")).toBe(
      "http://127.0.0.1:4649/api/notifications/stream",
    );
  });
});

describe("consumeNotificationEvents", () => {
  it("refreshes once for a changed SSE event split across chunks", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("event: changed\nda"));
        controller.enqueue(encoder.encode("ta: 1\n\n"));
        controller.close();
      },
    });
    let refreshes = 0;

    await consumeNotificationEvents(stream, () => {
      refreshes += 1;
    });

    expect(refreshes).toBe(1);
  });

  it("does not refresh for heartbeat events", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("event: ping\ndata: 1\n\n"));
        controller.close();
      },
    });
    let refreshes = 0;

    await consumeNotificationEvents(stream, () => {
      refreshes += 1;
    });

    expect(refreshes).toBe(0);
  });

  it("does not leak an abort error when cancelling an already errored stream", async () => {
    const controller = new AbortController();
    let streamController!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        streamController = controller;
      },
    });
    let onUnhandled!: (reason: unknown) => void;
    const unhandled = new Promise<unknown>((resolve) => {
      onUnhandled = resolve;
      process.once("unhandledRejection", onUnhandled);
    });
    const consuming = consumeNotificationEvents(stream, () => {}, {
      signal: controller.signal,
    }).catch(() => {});

    streamController.error(
      new DOMException("This operation was aborted", "AbortError"),
    );
    controller.abort();

    try {
      await expect(
        Promise.race([
          unhandled,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), 0)),
        ]),
      ).resolves.toBeNull();
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
    await consuming;
  });
});

describe("startNotificationStream", () => {
  it("uses the existing auth headers and refreshes when the server changes notifications", async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode("event: changed\ndata: 1\n\n"));
        controller.close();
      },
    });
    const fetchStream = vi.fn(
      async () =>
        new Response(stream, {
          headers: { "content-type": "text/event-stream" },
        }),
    );
    const onChange = vi.fn();
    const onConnected = vi.fn();

    const stop = startNotificationStream({
      url: "http://127.0.0.1:4649/api/notifications/stream",
      headers: { Authorization: "Bearer token" },
      fetchStream,
      onChange,
      onConnected,
    });

    await vi.waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
    expect(onConnected).toHaveBeenCalledTimes(1);
    expect(fetchStream).toHaveBeenCalledWith(
      "http://127.0.0.1:4649/api/notifications/stream",
      expect.objectContaining({ headers: { Authorization: "Bearer token" } }),
    );
    stop();
  });

  it("keeps fallback polling available for a non-SSE response", async () => {
    const stream = new ReadableStream<Uint8Array>({});
    const onConnected = vi.fn();
    const stop = startNotificationStream({
      url: "http://127.0.0.1:4649/api/notifications/stream",
      headers: {},
      fetchStream: async () => new Response(stream),
      onChange: () => {},
      onConnected,
    });

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onConnected).not.toHaveBeenCalled();
    stop();
  });

  it("drops a connection that never returns response headers", async () => {
    const onDisconnected = vi.fn();
    const fetchStream = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    const stop = startNotificationStream({
      url: "http://127.0.0.1:4649/api/notifications/stream",
      headers: {},
      fetchStream,
      onChange: () => {},
      onDisconnected,
      inactivityTimeoutMs: 10,
    });

    await vi.waitFor(() => expect(onDisconnected).toHaveBeenCalledTimes(1));
    stop();
  });

  it("drops a silent stream so fallback polling can resume", async () => {
    const stream = new ReadableStream<Uint8Array>({});
    const onDisconnected = vi.fn();
    const stop = startNotificationStream({
      url: "http://127.0.0.1:4649/api/notifications/stream",
      headers: {},
      fetchStream: async () =>
        new Response(stream, {
          headers: { "content-type": "text/event-stream" },
        }),
      onChange: () => {},
      onDisconnected,
      inactivityTimeoutMs: 10,
    });

    await vi.waitFor(() => expect(onDisconnected).toHaveBeenCalledTimes(1));
    stop();
  });
});
