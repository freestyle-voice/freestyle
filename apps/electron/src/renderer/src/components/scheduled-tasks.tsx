import { DataSkeleton } from "@renderer/components/data-skeleton";
import { queryKeys, scheduledTasksQueryOptions } from "@renderer/lib/query";
import {
  type ScheduledTaskView,
  updateScheduledTask,
} from "@renderer/lib/scheduled-tasks";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type React from "react";
import { useState } from "react";

function whenLastRun(value: string | null): string {
  if (!value) return "never run";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "never run";
  const diffMin = Math.round((Date.now() - date.getTime()) / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffMin < 60 * 24) return `${Math.round(diffMin / 60)}h ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ScheduledTasks({
  mascot = "Freestyle",
}: {
  mascot?: string;
}): React.JSX.Element {
  const queryClient = useQueryClient();
  const tasksQuery = useQuery(scheduledTasksQueryOptions());
  const tasks = tasksQuery.data ?? [];
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = (task: ScheduledTaskView): void => {
    const enabled = !task.enabled;
    const previous = queryClient.getQueryData<ScheduledTaskView[]>(
      queryKeys.scheduled.tasks,
    );
    setBusy(task.id);
    setError(null);
    queryClient.setQueryData<ScheduledTaskView[]>(
      queryKeys.scheduled.tasks,
      (current) =>
        current?.map((entry) =>
          entry.id === task.id ? { ...entry, enabled } : entry,
        ) ?? current,
    );
    void updateScheduledTask(task.id, { enabled })
      .then((updated) => {
        queryClient.setQueryData<ScheduledTaskView[]>(
          queryKeys.scheduled.tasks,
          (current) =>
            current?.map((entry) =>
              entry.id === updated.id ? updated : entry,
            ) ?? current,
        );
      })
      .catch(() => {
        queryClient.setQueryData(queryKeys.scheduled.tasks, previous);
        setError("Couldn’t update that task. Try again.");
      })
      .finally(() => setBusy(null));
  };

  if (tasksQuery.isLoading)
    return <DataSkeleton label="Loading scheduled tasks" />;
  if (tasksQuery.isError) {
    return (
      <div className="tavern-empty">
        <p>Couldn&apos;t load scheduled tasks.</p>
        <button type="button" onClick={() => void tasksQuery.refetch()}>
          Try again
        </button>
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="tavern-empty">
        Nothing scheduled. Ask {mascot} to do something regularly — "check the
        stocks every weekday morning" — and it lands here.
      </div>
    );
  }

  return (
    <>
      <p className="tavern-set-hint is-lead">
        These run on their own, even with this app closed. They only notify you
        when there&apos;s something worth knowing — every run is saved either
        way.
      </p>
      {error ? (
        <p className="tavern-notice" role="alert">
          {error}
        </p>
      ) : null}
      {tasks.map((task) => (
        <div
          key={task.id}
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
              disabled={busy === task.id}
              onClick={() => toggle(task)}
            >
              {task.enabled ? "On" : "Off"}
            </button>
          </div>
          <p className="tavern-sched-schedule">{task.schedule}</p>
          <span className="tavern-sched-meta">
            {whenLastRun(task.lastCompletedAt)} · {task.timezone}
          </span>
        </div>
      ))}
    </>
  );
}
