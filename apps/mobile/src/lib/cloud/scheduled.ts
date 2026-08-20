import { cloud } from "./client";

export type ScheduledTask = {
  id: string;
  name: string;
  instruction: string;
  schedule: string;
  cron: string | null;
  kind: "cron" | "fuzzy";
  timezone: string;
  enabled: boolean;
  nextDueAt: string;
  lastCompletedAt: string | null;
  templateId: string | null;
};

export async function listScheduledTasks(): Promise<ScheduledTask[]> {
  const result = await cloud.json<{ tasks: ScheduledTask[] }>(
    "/v2/scheduled/tasks",
  );
  return result.tasks;
}

export async function setScheduledTaskEnabled(
  taskId: string,
  enabled: boolean,
): Promise<ScheduledTask> {
  const result = await cloud.json<{ task: ScheduledTask }>(
    `/v2/scheduled/tasks/${encodeURIComponent(taskId)}`,
    { method: "PATCH", json: { enabled } },
  );
  return result.task;
}

export async function runScheduledTask(taskId: string): Promise<{
  threadId: string | null;
  notificationId: string | null;
}> {
  return cloud.json(`/v2/scheduled/tasks/${encodeURIComponent(taskId)}/run`, {
    method: "POST",
  });
}

export async function deleteScheduledTask(taskId: string): Promise<void> {
  const response = await cloud.request(
    `/v2/scheduled/tasks/${encodeURIComponent(taskId)}`,
    { method: "DELETE" },
  );
  if (!response.ok) throw new Error("Could not delete scheduled task.");
}
