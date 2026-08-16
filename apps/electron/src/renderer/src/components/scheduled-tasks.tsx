import { apiFetch } from "@renderer/lib/api";
import type React from "react";
import { useCallback, useEffect, useState } from "react";

interface ScheduledTaskView {
  id: string;
  name: string;
  schedule: string;
  timezone: string;
  enabled: boolean;
  lastCompletedAt: string | null;
}

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

async function readTasks(): Promise<ScheduledTaskView[]> {
  const response = await apiFetch("/api/scheduled/tasks");
  if (!response.ok) throw new Error("Scheduled tasks are unavailable.");
  const payload = (await response.json()) as { tasks?: ScheduledTaskView[] };
  return (payload.tasks ?? []).sort((a, b) => a.name.localeCompare(b.name));
}

export function ScheduledTasks({
  mascot = "Freestyle",
}: {
  mascot?: string;
}): React.JSX.Element {
  const [tasks, setTasks] = useState<ScheduledTaskView[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback((): void => {
    void readTasks()
      .catch(() => [])
      .then(setTasks);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = (task: ScheduledTaskView): void => {
    const enabled = !task.enabled;
    setBusy(task.id);
    setTasks(
      (previous) =>
        previous?.map((entry) =>
          entry.id === task.id ? { ...entry, enabled } : entry,
        ) ?? previous,
    );
    void apiFetch(`/api/scheduled/tasks/${encodeURIComponent(task.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    })
      .then((response) => {
        if (!response.ok) throw new Error("Could not update task");
      })
      .catch(load)
      .finally(() => setBusy(null));
  };

  if (tasks === null)
    return <div className="tavern-empty">Loading scheduled tasks…</div>;

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
        These run on their own, even with this app closed. Every run sends you a
        notification.
      </p>
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
