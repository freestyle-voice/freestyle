import { describe, expect, it, vi } from "vitest";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@renderer/lib/api", () => ({ apiFetch }));

import {
  listNotificationHistory,
  type NotificationHistoryError,
} from "./notifications";

describe("notification history client", () => {
  it("returns rows from the notification history endpoint", async () => {
    apiFetch.mockResolvedValue(
      new Response(JSON.stringify({ notifications: [{ id: "n1" }] })),
    );

    await expect(listNotificationHistory()).resolves.toEqual([{ id: "n1" }]);
  });

  it("treats malformed history data as unreachable", async () => {
    apiFetch.mockResolvedValue(new Response("not json"));

    await expect(listNotificationHistory()).rejects.toMatchObject({
      kind: "unreachable",
    } satisfies Pick<NotificationHistoryError, "kind">);
  });
});
