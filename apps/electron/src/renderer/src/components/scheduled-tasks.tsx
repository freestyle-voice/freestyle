import { DataSkeleton } from "@renderer/components/data-skeleton";
import { capture } from "@renderer/lib/analytics";
import { deleteBrainFile, writeBrainFile } from "@renderer/lib/brain-fs";
import {
  runScheduledTaskNow,
  type ScheduledTaskView,
  toggleScheduledTaskEnabled,
} from "@renderer/lib/brain-views";
import {
  queryKeys,
  scheduledRunTimesQueryOptions,
  scheduledTasksQueryOptions,
} from "@renderer/lib/query";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type React from "react";
import { useState } from "react";

function relative(ts: number): string {
  const diffMin = Math.round((Date.now() - ts) / 60_000);
  const ahead = diffMin < 0;
  const mins = Math.abs(diffMin);
  const body =
    mins < 1
      ? "just now"
      : mins < 60
        ? `${mins}m`
        : mins < 60 * 24
          ? `${Math.round(mins / 60)}h`
          : new Date(ts).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            });
  if (body === "just now") return body;
  return ahead ? `in ${body}` : `${body} ago`;
}

function meta(task: ScheduledTaskView, nextRun: number | null): string {
  const last = task.lastRun
    ? `ran ${relative(task.lastRun.getTime())}`
    : "never run";
  if (!task.enabled) return `${last} · paused`;
  return nextRun ? `${last} · next ${relative(nextRun)}` : last;
}

export function ScheduledTasks({
  mascot = "Freestyle",
}: {
  mascot?: string;
}): React.JSX.Element {
  const queryClient = useQueryClient();
  const tasksQuery = useQuery(scheduledTasksQueryOptions());
  const runTimesQuery = useQuery(scheduledRunTimesQueryOptions());
  const tasks = tasksQuery.data ?? [];
  const runTimes = runTimesQuery.data ?? {};
  const [busy, setBusy] = useState<string | null>(null);
  const [ran, setRan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const refreshAll = (): void => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.brain.all });
    void queryClient.invalidateQueries({
      queryKey: queryKeys.brain.scheduledRunTimes,
    });
  };

  const toggle = (task: ScheduledTaskView): void => {
    const next = !task.enabled;
    capture("scheduled_task_toggled", {
      enabled: next,
      task: task.name,
      hasRun: task.lastRun !== null,
    });
    setBusy(task.path);
    queryClient.setQueryData<ScheduledTaskView[]>(
      queryKeys.brain.scheduledTasks,
      (previous) =>
        previous?.map((t) =>
          t.path === task.path ? { ...t, enabled: next } : t,
        ) ?? previous,
    );
    const nextContent = toggleScheduledTaskEnabled(task.content, next);
    void writeBrainFile(task.path, nextContent)
      .then((ok) => {
        if (!ok) {
          void queryClient.invalidateQueries({
            queryKey: queryKeys.brain.scheduledTasks,
          });
          return;
        }
        queryClient.setQueryData(queryKeys.brain.file(task.path), nextContent);
        refreshAll();
      })
      .finally(() => setBusy(null));
  };

  const runNow = (task: ScheduledTaskView): void => {
    setBusy(task.path);
    setError(null);
    setRan(null);
    capture("scheduled_task_run_now", { task: task.name });
    void runScheduledTaskNow(task.path)
      .then(() => {
        setRan(task.path);
        refreshAll();
      })
      .catch(() => setError("That didn't run. Try again in a moment."))
      .finally(() => setBusy(null));
  };

  const remove = (task: ScheduledTaskView): void => {
    setBusy(task.path);
    setConfirming(null);
    capture("scheduled_task_deleted", { task: task.name });
    void deleteBrainFile(task.path)
      .then(() => refreshAll())
      .catch(() => setError("Couldn't delete that one."))
      .finally(() => setBusy(null));
  };

  if (tasksQuery.isLoading)
    return <DataSkeleton label="Loading scheduled tasks" />;
  if (tasksQuery.isError)
    return (
      <div className="tavern-empty">
        <p>Couldn&apos;t load scheduled tasks.</p>
        <button type="button" onClick={() => void tasksQuery.refetch()}>
          Try again
        </button>
      </div>
    );

  if (tasks.length === 0)
    return (
      <div className="tavern-empty">
        Nothing scheduled. Ask {mascot} to do something regularly — "check the
        stocks every weekday morning" — and it lands here.
      </div>
    );

  return (
    <>
      <p className="tavern-set-hint is-lead">
        These run on their own, even with this app closed. They only notify you
        when there's something worth knowing — every run is saved either way.
      </p>
      {error ? (
        <p className="tavern-notice" role="alert">
          {error}
        </p>
      ) : null}
      {tasks.map((task) => (
        <div
          key={task.path}
          className={`tavern-sched${task.enabled ? "" : " is-off"}`}
        >
          <div className="tavern-sched-head">
            <span className="tavern-sched-name">{task.name}</span>
            <button
              type="button"
              className={`tavern-sched-toggle${task.enabled ? " is-on" : ""}`}
              role="switch"
              aria-checked={task.enabled}
              aria-label={`${task.name} enabled`}
              disabled={busy === task.path}
              onClick={() => toggle(task)}
            >
              {task.enabled ? "On" : "Off"}
            </button>
          </div>
          <p className="tavern-sched-schedule">{task.schedule}</p>
          <span className="tavern-sched-meta">
            {meta(task, runTimes[task.path] ?? null)}
          </span>
          <div className="tavern-sched-actions">
            <button
              type="button"
              className="tavern-sched-action"
              disabled={busy === task.path}
              onClick={() => runNow(task)}
            >
              {busy === task.path
                ? "Running…"
                : ran === task.path
                  ? "Ran ✓"
                  : "Run now"}
            </button>
            {confirming === task.path ? (
              <>
                <button
                  type="button"
                  className="tavern-sched-action is-danger"
                  onClick={() => remove(task)}
                >
                  Delete for good
                </button>
                <button
                  type="button"
                  className="tavern-sched-action"
                  onClick={() => setConfirming(null)}
                >
                  Keep
                </button>
              </>
            ) : (
              <button
                type="button"
                className="tavern-sched-action"
                disabled={busy === task.path}
                onClick={() => setConfirming(task.path)}
              >
                Delete
              </button>
            )}
          </div>
        </div>
      ))}
      <p className="tavern-set-hint">
        Editing what a task does happens in Brain → scheduled_tasks.
      </p>
    </>
  );
}
