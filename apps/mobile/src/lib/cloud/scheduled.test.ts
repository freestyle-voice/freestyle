import { beforeEach, describe, expect, it, vi } from "vitest";

const { json, request } = vi.hoisted(() => ({
  json: vi.fn(),
  request: vi.fn(),
}));

vi.mock("./client", () => ({ cloud: { json, request } }));

import {
  createScheduledTask,
  deleteScheduledTask,
  listScheduledTasks,
  runScheduledTask,
  setScheduledTaskEnabled,
  updateScheduledTask,
} from "./scheduled";

describe("mobile scheduled-task client", () => {
  beforeEach(() => {
    json.mockReset();
    request.mockReset();
  });

  it("lists the active workspace's durable tasks", async () => {
    json.mockResolvedValueOnce({ tasks: [{ id: "task-1", enabled: true }] });

    await expect(listScheduledTasks()).resolves.toEqual([
      { id: "task-1", enabled: true },
    ]);
    expect(json).toHaveBeenCalledWith("/v2/scheduled/tasks");
  });

  it("pauses a task without changing its instruction", async () => {
    json.mockResolvedValueOnce({ task: { id: "task-1", enabled: false } });

    await expect(setScheduledTaskEnabled("task-1", false)).resolves.toEqual({
      id: "task-1",
      enabled: false,
    });
    expect(json).toHaveBeenCalledWith("/v2/scheduled/tasks/task-1", {
      method: "PATCH",
      json: { enabled: false },
    });
  });

  it("creates and edits a task with the same API contract as desktop", async () => {
    json
      .mockResolvedValueOnce({ task: { id: "task-1", name: "Morning" } })
      .mockResolvedValueOnce({ task: { id: "task-1", name: "Daily" } });

    await expect(
      createScheduledTask({
        name: "Morning",
        instruction: "Check priorities",
        schedule: "Every morning at 8",
        cron: "0 8 * * *",
        timezone: "Asia/Kolkata",
      }),
    ).resolves.toEqual({ id: "task-1", name: "Morning" });
    await expect(
      updateScheduledTask("task-1", { name: "Daily" }),
    ).resolves.toEqual({ id: "task-1", name: "Daily" });

    expect(json).toHaveBeenNthCalledWith(1, "/v2/scheduled/tasks", {
      method: "POST",
      json: {
        name: "Morning",
        instruction: "Check priorities",
        schedule: "Every morning at 8",
        cron: "0 8 * * *",
        timezone: "Asia/Kolkata",
      },
    });
    expect(json).toHaveBeenNthCalledWith(2, "/v2/scheduled/tasks/task-1", {
      method: "PATCH",
      json: { name: "Daily" },
    });
  });

  it("uses the no-content delete route", async () => {
    request.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(deleteScheduledTask("task-1")).resolves.toBeUndefined();
    expect(request).toHaveBeenCalledWith("/v2/scheduled/tasks/task-1", {
      method: "DELETE",
    });
  });

  it("runs a task through the metered scheduler path", async () => {
    json.mockResolvedValueOnce({
      ok: true,
      threadId: "thread-1",
      notificationId: null,
    });
    await expect(runScheduledTask("task-1")).resolves.toEqual({
      threadId: "thread-1",
      notificationId: null,
    });
    expect(json).toHaveBeenCalledWith("/v2/scheduled/tasks/task-1/run", {
      method: "POST",
    });
  });

  it("waits for an asynchronously queued run before opening its brief", async () => {
    json
      .mockResolvedValueOnce({ ok: true, runId: "run-1" })
      .mockResolvedValueOnce({
        run: {
          id: "run-1",
          status: "succeeded",
          threadId: "thread-1",
          notificationId: "notice-1",
          error: null,
          startedAt: 1,
          completedAt: 2,
        },
      });

    await expect(
      runScheduledTask("task-1", { pollIntervalMs: 0 }),
    ).resolves.toEqual({ threadId: "thread-1", notificationId: "notice-1" });
    expect(json).toHaveBeenNthCalledWith(
      2,
      "/v2/scheduled/tasks/task-1/runs/run-1",
    );
  });
});
