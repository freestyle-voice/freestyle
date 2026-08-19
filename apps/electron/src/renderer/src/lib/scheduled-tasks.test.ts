import { beforeEach, describe, expect, it, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock("@renderer/lib/api", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

const { runScheduledTaskNow } = await import("./scheduled-tasks");

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

beforeEach(() => {
  apiFetch.mockReset();
});

describe("runScheduledTaskNow", () => {
  it("starts the run, polls until it succeeds, and returns the thread", async () => {
    apiFetch
      .mockResolvedValueOnce(
        json({ ok: true, runId: "run-1", status: "running" }, 202),
      )
      .mockResolvedValueOnce(
        json({
          run: {
            id: "run-1",
            status: "running",
            threadId: null,
            notificationId: null,
            error: null,
          },
        }),
      )
      .mockResolvedValueOnce(
        json({
          run: {
            id: "run-1",
            status: "succeeded",
            threadId: "thread-1",
            notificationId: "n-1",
            error: null,
          },
        }),
      );
    await expect(
      runScheduledTaskNow("task-1", { pollIntervalMs: 1 }),
    ).resolves.toEqual({
      ok: true,
      threadId: "thread-1",
      notificationId: "n-1",
    });
    expect(apiFetch).toHaveBeenCalledTimes(3);
    expect(apiFetch.mock.calls[0][0]).toBe("/api/scheduled/tasks/task-1/run");
    expect(apiFetch.mock.calls[1][0]).toBe(
      "/api/scheduled/tasks/task-1/runs/run-1",
    );
  });

  it("surfaces the run's error when it fails", async () => {
    apiFetch
      .mockResolvedValueOnce(
        json({ ok: true, runId: "run-1", status: "running" }, 202),
      )
      .mockResolvedValueOnce(
        json({
          run: {
            id: "run-1",
            status: "failed",
            threadId: null,
            notificationId: null,
            error: "boom",
          },
        }),
      );
    await expect(
      runScheduledTaskNow("task-1", { pollIntervalMs: 1 }),
    ).rejects.toThrow("boom");
  });

  it("still accepts a synchronous response from older servers", async () => {
    apiFetch.mockResolvedValueOnce(
      json({ ok: true, threadId: "thread-9", notificationId: null }),
    );
    await expect(runScheduledTaskNow("task-1")).resolves.toEqual({
      ok: true,
      threadId: "thread-9",
      notificationId: null,
    });
    expect(apiFetch).toHaveBeenCalledTimes(1);
  });

  it("gives up after the timeout instead of polling forever", async () => {
    apiFetch
      .mockResolvedValueOnce(
        json({ ok: true, runId: "run-1", status: "running" }, 202),
      )
      .mockImplementation(async () =>
        json({
          run: {
            id: "run-1",
            status: "running",
            threadId: null,
            notificationId: null,
            error: null,
          },
        }),
      );
    await expect(
      runScheduledTaskNow("task-1", { pollIntervalMs: 1, timeoutMs: 10 }),
    ).rejects.toThrow(/longer than expected/);
  });
});
