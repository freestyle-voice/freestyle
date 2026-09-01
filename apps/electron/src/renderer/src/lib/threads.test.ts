import { describe, expect, it, vi } from "vitest";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));

vi.mock("@renderer/lib/api", () => ({ apiFetch }));

import {
  createQueryClient,
  optimisticallyDeleteThread,
  queryKeys,
  removeThreadFromHistory,
  restoreOptimisticallyDeletedThread,
  threadHistoryInfiniteQueryOptions,
} from "./query";
import {
  cancelDurableTurn,
  deleteThread,
  displayThreadTitle,
  getDurableThreadRuns,
  getDurableTurnEvents,
  listThreads,
} from "./threads";

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

  it("loads a redacted durable-run timeline through the local proxy", async () => {
    apiFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          events: [
            {
              id: "event-1",
              turnId: "turn-1",
              threadId: "thread-1",
              eventType: "turn",
              status: "running",
              summary: "Remix started working",
              createdAt: "2026-09-01T12:00:00.000Z",
            },
          ],
        }),
      ),
    );

    await expect(getDurableTurnEvents("turn/one")).resolves.toHaveLength(1);
    expect(apiFetch).toHaveBeenCalledWith("/api/agent/turn/turn%2Fone/events");
  });

  it("keeps an older Cloud deployment non-blocking until its timeline endpoint arrives", async () => {
    apiFetch.mockResolvedValue(new Response(null, { status: 404 }));

    await expect(getDurableTurnEvents("turn-1")).resolves.toEqual([]);
  });

  it("loads recoverable run history through the local proxy", async () => {
    apiFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          runs: [
            {
              id: "turn-1",
              threadId: "thread-1",
              clientRequestId: "request-1",
              firstTurn: true,
              status: "completed",
              error: null,
              createdAt: "2026-09-01T12:00:00.000Z",
              updatedAt: "2026-09-01T12:00:01.000Z",
              completedAt: "2026-09-01T12:00:01.000Z",
            },
          ],
        }),
      ),
    );

    await expect(getDurableThreadRuns("thread/one")).resolves.toHaveLength(1);
    expect(apiFetch).toHaveBeenCalledWith(
      "/api/agent/thread/thread%2Fone/runs",
    );
  });

  it("keeps a rolling Cloud deployment non-blocking until run history arrives", async () => {
    apiFetch.mockResolvedValue(new Response(null, { status: 404 }));

    await expect(getDurableThreadRuns("thread-1")).resolves.toEqual([]);
  });
});

describe("displayThreadTitle", () => {
  it("uses the persisted agent-generated title instead of replaying the first message", () => {
    expect(displayThreadTitle({ title: "Ajmer weather outlook" })).toBe(
      "Ajmer weather outlook",
    );
  });

  it("keeps a new chat neutral until the agent has named it", () => {
    expect(displayThreadTitle({ title: null })).toBe("New chat");
  });
});

describe("optimistic session deletion", () => {
  it("removes the active session and restores its exact cache snapshot on failure", () => {
    const queryClient = createQueryClient();
    const active = { id: "active", messages: [] };
    queryClient.setQueryData(queryKeys.threads.list("user"), {
      pages: [
        {
          threads: [
            { id: "active", title: "Active", updatedAt: 2 },
            { id: "other", title: "Other", updatedAt: 1 },
          ],
          nextCursor: null,
        },
      ],
      pageParams: [null],
    });
    queryClient.setQueryData(queryKeys.threads.detail("active"), active);
    queryClient.setQueryData(queryKeys.threads.latest, active);

    const snapshot = optimisticallyDeleteThread(queryClient, "active", {
      active: "Pinned title",
      other: "Other title",
    });

    expect(
      queryClient.getQueryData<{
        pages: Array<{ threads: Array<{ id: string }> }>;
      }>(queryKeys.threads.list("user"))?.pages[0].threads,
    ).toEqual([{ id: "other", title: "Other", updatedAt: 1 }]);
    expect(queryClient.getQueryData(queryKeys.threads.detail("active"))).toBe(
      undefined,
    );
    expect(queryClient.getQueryData(queryKeys.threads.latest)).toBeNull();

    restoreOptimisticallyDeletedThread(queryClient, "active", snapshot);

    expect(
      queryClient.getQueryData<{
        pages: Array<{ threads: Array<{ id: string }> }>;
      }>(queryKeys.threads.list("user"))?.pages[0].threads,
    ).toEqual([
      { id: "active", title: "Active", updatedAt: 2 },
      { id: "other", title: "Other", updatedAt: 1 },
    ]);
    expect(
      queryClient.getQueryData(queryKeys.threads.detail("active")),
    ).toEqual(active);
    expect(queryClient.getQueryData(queryKeys.threads.latest)).toEqual(active);
  });

  it("removes a session from every cached history page immediately", () => {
    const queryClient = createQueryClient();
    queryClient.setQueryData(queryKeys.threads.list("user"), {
      pages: [
        {
          threads: [
            { id: "active", title: "Active", updatedAt: 2 },
            { id: "other", title: "Other", updatedAt: 1 },
          ],
          nextCursor: 10,
        },
        {
          threads: [{ id: "active", title: "Active", updatedAt: 2 }],
          nextCursor: null,
        },
      ],
      pageParams: [null, 10],
    });
    queryClient.setQueryData(queryKeys.threads.list("scheduled"), {
      pages: [
        {
          threads: [{ id: "active", title: "Active", updatedAt: 2 }],
          nextCursor: null,
        },
      ],
      pageParams: [null],
    });

    removeThreadFromHistory(queryClient, "active");

    expect(
      queryClient
        .getQueryData<{
          pages: Array<{ threads: Array<{ id: string }> }>;
        }>(queryKeys.threads.list("user"))
        ?.pages.flatMap((page) => page.threads.map((thread) => thread.id)),
    ).toEqual(["other"]);
    expect(
      queryClient
        .getQueryData<{
          pages: Array<{ threads: Array<{ id: string }> }>;
        }>(queryKeys.threads.list("scheduled"))
        ?.pages.flatMap((page) => page.threads.map((thread) => thread.id)),
    ).toEqual([]);
  });
});
