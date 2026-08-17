import { describe, expect, it, vi } from "vitest";
import {
  consumeNotificationEvents,
  startNotificationStream,
} from "./notification-stream";

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
    const fetchStream = vi.fn(async () => new Response(stream));
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
});
