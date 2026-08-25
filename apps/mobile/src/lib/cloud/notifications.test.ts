import { beforeEach, describe, expect, it, vi } from "vitest";

const { json } = vi.hoisted(() => ({ json: vi.fn() }));

vi.mock("./client", () => ({ cloud: { json } }));

import {
  dismissNotification,
  listNotificationHistory,
  listNotifications,
  openNotification,
} from "./notifications";

describe("mobile notification inbox client", () => {
  beforeEach(() => json.mockReset());

  it("loads undismissed agent notifications", async () => {
    json.mockResolvedValueOnce({ notifications: [{ id: "notice-1" }] });
    await expect(listNotifications()).resolves.toEqual([{ id: "notice-1" }]);
    expect(json).toHaveBeenCalledWith("/v2/notifications");
  });

  it("loads the complete notification history for reopened briefs", async () => {
    json.mockResolvedValueOnce({ notifications: [{ id: "notice-1" }] });

    await expect(listNotificationHistory()).resolves.toEqual([
      { id: "notice-1" },
    ]);
    expect(json).toHaveBeenCalledWith("/v2/notifications/history");
  });

  it("records open and dismiss actions separately", async () => {
    json
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true });
    await openNotification("notice-1");
    await dismissNotification("notice-1");
    expect(json).toHaveBeenNthCalledWith(1, "/v2/notifications/notice-1/open", {
      method: "POST",
    });
    expect(json).toHaveBeenNthCalledWith(
      2,
      "/v2/notifications/notice-1/dismiss",
      { method: "POST" },
    );
  });
});
