import type { InboxMessage } from "@trycourier/courier-react";
import { describe, expect, it, vi } from "vitest";
import {
  activeCourierNotifications,
  archiveCourierNotification,
  courierNotificationItem,
  notificationThreadId,
  openCourierNotification,
} from "./courier-notifications";

function message(overrides: Partial<InboxMessage> = {}): InboxMessage {
  return {
    messageId: "message-1",
    title: "Morning brief",
    body: "Your Remix is ready.",
    created: "2026-08-26T12:00:00.000Z",
    data: {
      notificationId: "notification-1",
      threadId: "thread-1",
    },
    ...overrides,
  };
}

describe("Courier notification mapping", () => {
  it("uses Courier's message id for lifecycle actions and preserves Cloud metadata", () => {
    expect(courierNotificationItem(message())).toEqual({
      id: "message-1",
      notificationId: "notification-1",
      title: "Morning brief",
      body: "Your Remix is ready.",
      threadId: "thread-1",
      createdAt: Date.parse("2026-08-26T12:00:00.000Z"),
      readAt: null,
      openedAt: null,
      archivedAt: null,
      message: message(),
    });
  });

  it("ignores malformed thread ids instead of routing an unsafe value", () => {
    expect(
      notificationThreadId(message({ data: { threadId: { id: "bad" } } })),
    ).toBeNull();
  });

  it("shows only unopened, unarchived messages in the companion bubble", () => {
    const fresh = message();
    const opened = message({
      messageId: "opened",
      opened: "2026-08-26T12:05:00.000Z",
    });
    const archived = message({
      messageId: "archived",
      archived: "2026-08-26T12:06:00.000Z",
    });

    expect(activeCourierNotifications([archived, opened, fresh])).toEqual([
      courierNotificationItem(fresh),
    ]);
  });
});

describe("Courier notification lifecycle", () => {
  it("marks a notification opened, tracks its click, and then routes its thread", async () => {
    const item = courierNotificationItem(message());
    const lifecycle = {
      openMessage: vi.fn(),
      clickMessage: vi.fn(async () => {}),
      archiveMessage: vi.fn(async () => {}),
    };
    const route = vi.fn();

    await openCourierNotification(item, lifecycle, route);

    expect(lifecycle.openMessage).toHaveBeenCalledWith(item.message);
    expect(lifecycle.clickMessage).toHaveBeenCalledWith(item.message);
    expect(route).toHaveBeenCalledWith("thread-1");
  });

  it("archives a cleared notification", async () => {
    const item = courierNotificationItem(message());
    const archiveMessage = vi.fn(async () => {});

    await archiveCourierNotification(item, { archiveMessage });

    expect(archiveMessage).toHaveBeenCalledWith(item.message);
  });
});
