import { describe, expect, it, vi } from "vitest";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock("@renderer/lib/api", () => ({ apiFetch }));

import { threadHistoryInfiniteQueryOptions } from "./query";
import { cancelDurableTurn, deleteThread, listThreads } from "./threads";

describe("thread client", () => {
  it("passes a cursor and preserves the server next cursor", async () => {
    apiFetch.mockResolvedValue(
      new Response(JSON.stringify({ threads: [], nextCursor: 42 })),
    );

    await expect(listThreads({ cursor: 20, limit: 24 })).resolves.toEqual({
      threads: [],
      nextCursor: 42,
    });
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/agent/thread/list?limit=24&cursor=20",
    );
  });

  it("uses only the API next cursor for another history page", () => {
    const options = threadHistoryInfiniteQueryOptions();
    expect(options.initialPageParam).toBeNull();
    expect(options.getNextPageParam({ threads: [], nextCursor: 42 })).toBe(42);
    expect(
      options.getNextPageParam({ threads: [], nextCursor: null }),
    ).toBeUndefined();
  });

  it("sends an explicit durable cancel instead of only dropping the stream", async () => {
    apiFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true })));

    await cancelDurableTurn("turn-123");

    expect(apiFetch).toHaveBeenCalledWith(
      "/api/agent/turn/turn-123/commands",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ type: "cancel" }),
      }),
    );
  });

  it("deletes a single Remix session through the existing local proxy", async () => {
    apiFetch.mockResolvedValue(new Response(JSON.stringify({ ok: true })));

    await deleteThread("thread/one");

    expect(apiFetch).toHaveBeenCalledWith("/api/agent/thread/thread%2Fone", {
      method: "DELETE",
    });
  });
});
