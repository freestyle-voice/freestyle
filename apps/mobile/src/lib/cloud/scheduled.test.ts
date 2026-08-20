import { beforeEach, describe, expect, it, vi } from "vitest";

const { json, request } = vi.hoisted(() => ({
  json: vi.fn(),
  request: vi.fn(),
}));

vi.mock("./client", () => ({ cloud: { json, request } }));

import {
  deleteScheduledTask,
  listScheduledTasks,
  runScheduledTask,
  setScheduledTaskEnabled,
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
      ok: true,
      threadId: "thread-1",
      notificationId: null,
    });
    expect(json).toHaveBeenCalledWith("/v2/scheduled/tasks/task-1/run", {
      method: "POST",
    });
  });
});
