import { DataSkeleton } from "@renderer/components/data-skeleton";
import { capture } from "@renderer/lib/analytics";
import { writeBrainFile } from "@renderer/lib/brain-fs";
import {
  type ScheduledTaskView,
  toggleScheduledTaskEnabled,
} from "@renderer/lib/brain-views";
import { queryKeys, scheduledTasksQueryOptions } from "@renderer/lib/query";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type React from "react";
import { useState } from "react";

function whenLastRun(date: Date | null): string {
  if (!date) return "never run";
  const diffMin = Math.round((Date.now() - date.getTime()) / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffMin < 60 * 24) return `${Math.round(diffMin / 60)}h ago`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ScheduledTasks(): React.JSX.Element {
  const queryClient = useQueryClient();
  const tasksQuery = useQuery(scheduledTasksQueryOptions());
  const tasks = tasksQuery.data ?? [];
  const [busy, setBusy] = useState<string | null>(null);

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
        void queryClient.invalidateQueries({ queryKey: queryKeys.brain.all });
      })
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
        Nothing scheduled. Ask Jeb to do something regularly — "check the stocks
        every weekday morning" — and it lands here.
      </div>
    );

  return (
    <>
      <p className="tavern-set-hint is-lead">
        These run on their own, even with this app closed. Every run sends you a
        notification.
      </p>
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
              disabled={busy === task.path}
              onClick={() => toggle(task)}
            >
              {task.enabled ? "On" : "Off"}
            </button>
          </div>
          <p className="tavern-sched-schedule">{task.schedule}</p>
          <span className="tavern-sched-meta">{whenLastRun(task.lastRun)}</span>
        </div>
      ))}
    </>
  );
}
