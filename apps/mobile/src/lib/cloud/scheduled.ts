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

export type ScheduledTaskInput = Pick<
  ScheduledTask,
  "name" | "instruction" | "schedule" | "cron" | "timezone"
>;

export type ScheduledTaskPatch = Partial<ScheduledTaskInput> & {
  enabled?: boolean;
};

export type ScheduledTaskRunStatus =
  | "claimed"
  | "running"
  | "succeeded"
  | "failed";

export type ScheduledTaskRun = {
  id: string;
  status: ScheduledTaskRunStatus;
  threadId: string | null;
  notificationId: string | null;
  error: string | null;
  startedAt: number | null;
  completedAt: number | null;
};

export type ScheduledTaskRunResult = {
  threadId: string | null;
  notificationId: string | null;
};

const RUN_POLL_INTERVAL_MS = 2_000;
const RUN_POLL_TIMEOUT_MS = 20 * 60_000;

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

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

export async function createScheduledTask(
  input: ScheduledTaskInput,
): Promise<ScheduledTask> {
  const result = await cloud.json<{ task: ScheduledTask }>(
    "/v2/scheduled/tasks",
    { method: "POST", json: input },
  );
  return result.task;
}

export async function updateScheduledTask(
  taskId: string,
  patch: ScheduledTaskPatch,
): Promise<ScheduledTask> {
  const result = await cloud.json<{ task: ScheduledTask }>(
    `/v2/scheduled/tasks/${encodeURIComponent(taskId)}`,
    { method: "PATCH", json: patch },
  );
  return result.task;
}

export async function getScheduledTaskRun(
  taskId: string,
  runId: string,
): Promise<ScheduledTaskRun> {
  const result = await cloud.json<{ run: ScheduledTaskRun }>(
    `/v2/scheduled/tasks/${encodeURIComponent(taskId)}/runs/${encodeURIComponent(runId)}`,
  );
  return result.run;
}

export async function runScheduledTask(
  taskId: string,
  options: {
    pollIntervalMs?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
  } = {},
): Promise<ScheduledTaskRunResult> {
  const started = await cloud.json<{
    runId?: string;
    threadId?: string | null;
    notificationId?: string | null;
  }>(`/v2/scheduled/tasks/${encodeURIComponent(taskId)}/run`, {
    method: "POST",
    signal: options.signal,
  });
  if (!started.runId) {
    return {
      threadId: started.threadId ?? null,
      notificationId: started.notificationId ?? null,
    };
  }

  const interval = options.pollIntervalMs ?? RUN_POLL_INTERVAL_MS;
  const deadline = Date.now() + (options.timeoutMs ?? RUN_POLL_TIMEOUT_MS);
  let failures = 0;
  while (Date.now() < deadline) {
    let run: ScheduledTaskRun | null = null;
    try {
      run = await getScheduledTaskRun(taskId, started.runId);
      failures = 0;
    } catch (error) {
      failures += 1;
      if (failures >= 5) throw error;
    }
    if (run?.status === "succeeded") {
      return {
        threadId: run.threadId,
        notificationId: run.notificationId,
      };
    }
    if (run?.status === "failed") {
      throw new Error(run.error ?? "Scheduled task failed.");
    }
    await sleep(interval, options.signal);
  }
  throw new Error("That run is taking longer than expected. Check back soon.");
}

export async function deleteScheduledTask(taskId: string): Promise<void> {
  const response = await cloud.request(
    `/v2/scheduled/tasks/${encodeURIComponent(taskId)}`,
    { method: "DELETE" },
  );
  if (!response.ok) throw new Error("Could not delete scheduled task.");
}
