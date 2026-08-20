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

export type ScheduledTaskRunStatus =
  | "claimed"
  | "running"
  | "succeeded"
  | "failed";

export interface ScheduledTaskRunView {
  id: string;
  status: ScheduledTaskRunStatus;
  threadId: string | null;
  notificationId: string | null;
  error: string | null;
  startedAt: number | null;
  completedAt: number | null;
}

const RUN_POLL_INTERVAL_MS = 2_000;
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_CONSECUTIVE_POLL_FAILURES = 5;
// Run now queues the run for the next server tick (up to 5 minutes) before
// the run itself starts, so the budget covers queue wait plus a long run.
const RUN_POLL_TIMEOUT_MS = 20 * 60_000;

async function responseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | T
    | { error?: string }
    | null;
  if (!response.ok) {
    const error = (payload as { error?: string } | null)?.error;
    if (error) throw new Error(error);
    if (response.status === 409)
      throw new Error("That task is already running. Try again in a moment.");
    throw new Error("Scheduled tasks are unavailable.");
  }
  return payload as T;
}

const withTimeout = (init: RequestInit = {}): RequestInit => ({
  signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  ...init,
});

const json = (body: unknown): RequestInit =>
  withTimeout({
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

export async function listScheduledTasks(): Promise<ScheduledTaskView[]> {
  const data = await responseJson<{ tasks: ScheduledTaskView[] }>(
    await apiFetch("/api/scheduled/tasks", withTimeout()),
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
    withTimeout({ method: "DELETE" }),
  );
  if (!response.ok) await responseJson(response);
}

export async function getScheduledTaskRun(
  taskId: string,
  runId: string,
): Promise<ScheduledTaskRunView> {
  const data = await responseJson<{ run: ScheduledTaskRunView }>(
    await apiFetch(
      `/api/scheduled/tasks/${encodeURIComponent(taskId)}/runs/${encodeURIComponent(runId)}`,
      withTimeout(),
    ),
  );
  return data.run;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function runScheduledTaskNow(
  id: string,
  options: { pollIntervalMs?: number; timeoutMs?: number } = {},
): Promise<ScheduledTaskRunResult> {
  const started = await responseJson<{
    ok: true;
    runId?: string;
    status?: string;
    threadId?: string | null;
    notificationId?: string | null;
  }>(
    await apiFetch(
      `/api/scheduled/tasks/${encodeURIComponent(id)}/run`,
      withTimeout({ method: "POST" }),
    ),
  );
  if (!started.runId) {
    return {
      ok: true,
      threadId: started.threadId ?? null,
      notificationId: started.notificationId ?? null,
    };
  }
  const interval = options.pollIntervalMs ?? RUN_POLL_INTERVAL_MS;
  const deadline = Date.now() + (options.timeoutMs ?? RUN_POLL_TIMEOUT_MS);
  let failures = 0;
  while (Date.now() < deadline) {
    let run: ScheduledTaskRunView | null = null;
    try {
      run = await getScheduledTaskRun(id, started.runId);
      failures = 0;
    } catch (err) {
      failures += 1;
      if (failures >= MAX_CONSECUTIVE_POLL_FAILURES) throw err;
    }
    if (run?.status === "succeeded") {
      return {
        ok: true,
        threadId: run.threadId,
        notificationId: run.notificationId,
      };
    }
    if (run?.status === "failed") {
      throw new Error(run.error ?? "Scheduled task failed.");
    }
    await sleep(interval);
  }
  throw new Error("That run is taking longer than expected. Check back soon.");
}
