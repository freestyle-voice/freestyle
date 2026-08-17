import { describe, expect, it } from "vitest";
import createApp from "../src/index.js";
import { notificationEvents } from "../src/lib/notifications/events.js";

describe("notification events", () => {
  it("notifies active subscribers when the notification store changes", () => {
    let changes = 0;
    const unsubscribe = notificationEvents.subscribe(() => {
      changes += 1;
    });

    notificationEvents.emitChange();
    unsubscribe();
    notificationEvents.emitChange();

    expect(changes).toBe(1);
  });
});

describe("notification event stream", () => {
  it("sends a changed event to a connected client", async () => {
    const app = createApp();
    const response = await app.request("/api/notifications/stream");

    expect(response.headers.get("content-type")).toContain("text/event-stream");

    const reader = response.body?.getReader();
    expect(reader).toBeDefined();
    await reader?.read();

    await app.request("/api/notifications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "thread",
        title: "Jeb finished",
        body: "Your task is ready.",
      }),
    });
    const event = await reader?.read();

    expect(new TextDecoder().decode(event?.value)).toContain("event: changed");
    await reader?.cancel();
  });
});
