import { apiFetch } from "@renderer/lib/api";

export interface ScheduledTaskView {
  id: string;
  name: string;
  schedule: string;
  timezone: string;
  enabled: boolean;
  lastCompletedAt: string | null;
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

export async function listScheduledTasks(): Promise<ScheduledTaskView[]> {
  const data = await responseJson<{ tasks: ScheduledTaskView[] }>(
    await apiFetch("/api/scheduled/tasks"),
  );
  return data.tasks.toSorted((a, b) => a.name.localeCompare(b.name));
}

export async function updateScheduledTask(
  id: string,
  input: Pick<ScheduledTaskView, "enabled">,
): Promise<ScheduledTaskView> {
  const data = await responseJson<{ task: ScheduledTaskView }>(
    await apiFetch(`/api/scheduled/tasks/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
  return data.task;
}
