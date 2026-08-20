import type { QueryClient } from "@tanstack/react-query";
import { capture } from "./analytics";
import { queryKeys } from "./query";
import { runScheduledTaskNow } from "./scheduled-tasks";

export type RunNowState =
  | { status: "running"; startedAt: number }
  | { status: "ran"; threadId: string | null; completedAt: number }
  | { status: "error"; message: string };

type Listener = () => void;

const states = new Map<string, RunNowState>();
const listeners = new Set<Listener>();
let snapshot: ReadonlyMap<string, RunNowState> = new Map();

function emit(): void {
  snapshot = new Map(states);
  for (const listener of listeners) listener();
}

export function subscribeRunNow(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function runNowSnapshot(): ReadonlyMap<string, RunNowState> {
  return snapshot;
}

export function clearRunNow(taskId: string): void {
  if (states.delete(taskId)) emit();
}

export function startRunNow(
  queryClient: QueryClient,
  task: { id: string; name: string },
): void {
  if (states.get(task.id)?.status === "running") return;
  states.set(task.id, { status: "running", startedAt: Date.now() });
  emit();
  capture("scheduled_task_run_now", { task: task.name });
  void runScheduledTaskNow(task.id)
    .then((result) => {
      states.set(task.id, {
        status: "ran",
        threadId: result.threadId,
        completedAt: Date.now(),
      });
    })
    .catch((err: unknown) => {
      states.set(task.id, {
        status: "error",
        message:
          err instanceof Error && err.message
            ? err.message
            : "That didn’t run. Try again in a moment.",
      });
    })
    .finally(() => {
      emit();
      void queryClient.invalidateQueries({
        queryKey: queryKeys.scheduled.tasks,
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.threads.list("scheduled"),
      });
    });
}
