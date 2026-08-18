import { apiFetch } from "@renderer/lib/api";

export interface ScheduledTaskView {
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
}

export interface ScheduledTaskInput {
  name: string;
  instruction: string;
  schedule: string;
  cron: string | null;
  timezone: string;
}

export type ScheduledTaskPatch = Partial<ScheduledTaskInput> & {
  enabled?: boolean;
};

export interface ScheduledTaskRunResult {
  ok: true;
  threadId: string | null;
  notificationId: string | null;
}

async function responseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | T
    | { error?: string }
    | null;
  if (!response.ok) {
    const error = (payload as { error?: string } | null)?.error;
    throw new Error(error ?? "Scheduled tasks are unavailable.");
  }
  return payload as T;
}

const json = (body: unknown): RequestInit => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export async function listScheduledTasks(): Promise<ScheduledTaskView[]> {
  const data = await responseJson<{ tasks: ScheduledTaskView[] }>(
    await apiFetch("/api/scheduled/tasks"),
  );
  return data.tasks.toSorted((a, b) => a.name.localeCompare(b.name));
}

export async function createScheduledTask(
  input: ScheduledTaskInput,
): Promise<ScheduledTaskView> {
  const data = await responseJson<{ task: ScheduledTaskView }>(
    await apiFetch("/api/scheduled/tasks", { method: "POST", ...json(input) }),
  );
  return data.task;
}

export async function updateScheduledTask(
  id: string,
  patch: ScheduledTaskPatch,
): Promise<ScheduledTaskView> {
  const data = await responseJson<{ task: ScheduledTaskView }>(
    await apiFetch(`/api/scheduled/tasks/${encodeURIComponent(id)}`, {
      method: "PATCH",
      ...json(patch),
    }),
  );
  return data.task;
}

export async function deleteScheduledTask(id: string): Promise<void> {
  const response = await apiFetch(
    `/api/scheduled/tasks/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
  if (!response.ok) await responseJson(response);
}

export async function runScheduledTaskNow(
  id: string,
): Promise<ScheduledTaskRunResult> {
  return responseJson<ScheduledTaskRunResult>(
    await apiFetch(`/api/scheduled/tasks/${encodeURIComponent(id)}/run`, {
      method: "POST",
    }),
  );
}
