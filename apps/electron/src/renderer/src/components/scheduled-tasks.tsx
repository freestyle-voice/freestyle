import { DataSkeleton } from "@renderer/components/data-skeleton";
import { Markdown } from "@renderer/components/markdown";
import { capture } from "@renderer/lib/analytics";
import { queryKeys, scheduledTasksQueryOptions } from "@renderer/lib/query";
import {
  createScheduledTask,
  deleteScheduledTask,
  runScheduledTaskNow,
  type ScheduledTaskInput,
  type ScheduledTaskView,
  updateScheduledTask,
} from "@renderer/lib/scheduled-tasks";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type React from "react";
import { useEffect, useState } from "react";

type View =
  | { kind: "list" }
  | { kind: "detail"; id: string }
  | { kind: "edit"; id: string; draft: ScheduledTaskInput }
  | { kind: "create"; draft: ScheduledTaskInput };

function relative(value: string | null, prefix: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const diffMin = Math.round((date.getTime() - Date.now()) / 60_000);
  const abs = Math.abs(diffMin);
  const when =
    abs < 1
      ? "now"
      : abs < 60
        ? `${abs}m`
        : abs < 60 * 24
          ? `${Math.round(abs / 60)}h`
          : date.toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            });
  if (abs >= 60 * 24) return `${prefix} ${when}`;
  return diffMin < 0 ? `${prefix} ${when} ago` : `${prefix} in ${when}`;
}

function meta(task: ScheduledTaskView): string {
  const parts = [
    task.enabled ? relative(task.nextDueAt, "next") : "paused",
    relative(task.lastCompletedAt, "last ran") ?? "never run",
  ];
  return parts.filter(Boolean).join(" · ");
}

function emptyDraft(): ScheduledTaskInput {
  return {
    name: "",
    instruction: "",
    schedule: "",
    cron: null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

function draftOf(task: ScheduledTaskView): ScheduledTaskInput {
  return {
    name: task.name,
    instruction: task.instruction,
    schedule: task.schedule,
    cron: task.cron,
    timezone: task.timezone,
  };
}

function TaskForm({
  draft,
  onDraft,
  onSave,
  onCancel,
  busy,
}: {
  draft: ScheduledTaskInput;
  onDraft: (draft: ScheduledTaskInput) => void;
  onSave: () => void;
  onCancel: () => void;
  busy: boolean;
}): React.JSX.Element {
  const field = (
    label: string,
    key: "name" | "schedule" | "cron" | "timezone",
    placeholder: string,
  ): React.JSX.Element => (
    <label className="tavern-sched-field">
      <span className="tavern-sched-label">{label}</span>
      <input
        className="tavern-editor-name"
        value={draft[key] ?? ""}
        placeholder={placeholder}
        onChange={(e) =>
          onDraft({
            ...draft,
            [key]: key === "cron" ? e.target.value || null : e.target.value,
          })
        }
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onCancel();
          }
        }}
      />
    </label>
  );
  const valid =
    draft.name.trim() && draft.schedule.trim() && draft.instruction.trim();
  return (
    <div className="tavern-sched-form">
      {field("Name", "name", "Morning brief")}
      {field("Schedule, in your words", "schedule", "every weekday at 8am")}
      {field("Cron (optional, blank = fuzzy)", "cron", "0 8 * * 1-5")}
      {field("Timezone", "timezone", "America/Los_Angeles")}
      <label className="tavern-sched-field">
        <span className="tavern-sched-label">What Freestyle does</span>
        <textarea
          className="tavern-editor"
          value={draft.instruction}
          placeholder="Check the markets and tell me anything worth knowing."
          onChange={(e) => onDraft({ ...draft, instruction: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              onCancel();
            }
          }}
        />
      </label>
      <div className="tavern-approve-actions">
        <button
          type="button"
          className="tavern-approve-btn tavern-approve-allow"
          disabled={busy || !valid}
          onClick={onSave}
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" className="tavern-approve-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function ScheduledTasks({
  mascot = "Freestyle",
  onOpenChange,
}: {
  mascot?: string;
  onOpenChange?: (open: boolean) => void;
}): React.JSX.Element {
  const queryClient = useQueryClient();
  const tasksQuery = useQuery(scheduledTasksQueryOptions());
  const tasks = tasksQuery.data ?? [];
  const [view, setViewState] = useState<View>({ kind: "list" });
  const [busy, setBusy] = useState<string | null>(null);
  const [ran, setRan] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setView = (next: View): void => {
    setError(null);
    setConfirming(null);
    setViewState(next);
    onOpenChange?.(next.kind !== "list");
  };

  const openId =
    view.kind === "detail" || view.kind === "edit" ? view.id : null;
  const openTask = tasks.find((t) => t.id === openId);
  useEffect(() => {
    if (!openId || !tasksQuery.isSuccess || openTask) return;
    setViewState({ kind: "list" });
    onOpenChange?.(false);
  }, [openId, openTask, tasksQuery.isSuccess, onOpenChange]);

  const refresh = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: queryKeys.scheduled.tasks });

  const fail = (fallback: string) => (err: unknown) =>
    setError(err instanceof Error && err.message ? err.message : fallback);

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
    capture("scheduled_task_toggled", { task: task.name, enabled });
    void updateScheduledTask(task.id, { enabled })
      .then(() => refresh())
      .catch((err: unknown) => {
        queryClient.setQueryData(queryKeys.scheduled.tasks, previous);
        fail("Couldn’t update that task. Try again.")(err);
      })
      .finally(() => setBusy(null));
  };

  const runNow = (task: ScheduledTaskView): void => {
    setBusy(task.id);
    setRan(null);
    setError(null);
    capture("scheduled_task_run_now", { task: task.name });
    void runScheduledTaskNow(task.id)
      .then(() => {
        setRan(task.id);
        void refresh();
      })
      .catch(fail("That didn’t run. Try again in a moment."))
      .finally(() => setBusy(null));
  };

  const remove = (task: ScheduledTaskView): void => {
    setBusy(task.id);
    capture("scheduled_task_deleted", { task: task.name });
    void deleteScheduledTask(task.id)
      .then(() => {
        setView({ kind: "list" });
        void refresh();
      })
      .catch(fail("Couldn’t delete that task."))
      .finally(() => setBusy(null));
  };

  const save = (id: string | null, draft: ScheduledTaskInput): void => {
    setBusy(id ?? "new");
    setError(null);
    const request = id
      ? updateScheduledTask(id, draft)
      : createScheduledTask(draft);
    void request
      .then((task) => {
        capture(id ? "scheduled_task_edited" : "scheduled_task_created", {
          task: task.name,
        });
        void refresh();
        setView({ kind: "detail", id: task.id });
      })
      .catch(fail("Couldn’t save that task."))
      .finally(() => setBusy(null));
  };

  const notice = error ? (
    <p className="tavern-notice" role="alert">
      {error}
    </p>
  ) : null;

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

  if (view.kind === "create") {
    return (
      <>
        <button
          type="button"
          className="tavern-file-back"
          onClick={() => setView({ kind: "list" })}
        >
          ← New scheduled task
        </button>
        {notice}
        <TaskForm
          draft={view.draft}
          onDraft={(draft) => setViewState({ ...view, draft })}
          onSave={() => save(null, view.draft)}
          onCancel={() => setView({ kind: "list" })}
          busy={busy === "new"}
        />
      </>
    );
  }

  if (view.kind === "edit") {
    const task = openTask;
    return (
      <>
        <button
          type="button"
          className="tavern-file-back"
          onClick={() => setView({ kind: "detail", id: view.id })}
        >
          ← {task?.name ?? "Scheduled task"}
        </button>
        {notice}
        <TaskForm
          draft={view.draft}
          onDraft={(draft) => setViewState({ ...view, draft })}
          onSave={() => save(view.id, view.draft)}
          onCancel={() => setView({ kind: "detail", id: view.id })}
          busy={busy === view.id}
        />
      </>
    );
  }

  if (view.kind === "detail") {
    const task = openTask;
    if (!task) return <DataSkeleton label="Loading scheduled task" />;
    return (
      <>
        <button
          type="button"
          className="tavern-file-back"
          onClick={() => setView({ kind: "list" })}
        >
          ← Scheduled
        </button>
        {notice}
        <div
          className={`tavern-sched is-detail${task.enabled ? "" : " is-off"}`}
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
            {task.cron ? `cron ${task.cron} · ` : ""}
            {task.timezone}
          </span>
          <span className="tavern-sched-meta">{meta(task)}</span>
        </div>
        <p className="tavern-sched-label">What {mascot} does</p>
        <Markdown text={task.instruction} />
        <div className="tavern-sched-actions">
          <button
            type="button"
            className="tavern-sched-action"
            onClick={() =>
              setView({ kind: "edit", id: task.id, draft: draftOf(task) })
            }
          >
            Edit
          </button>
          <button
            type="button"
            className="tavern-sched-action"
            disabled={busy === task.id}
            onClick={() => runNow(task)}
          >
            {busy === task.id
              ? "Running…"
              : ran === task.id
                ? "Ran ✓"
                : "Run now"}
          </button>
          {confirming === task.id ? (
            <>
              <button
                type="button"
                className="tavern-sched-action is-danger"
                disabled={busy === task.id}
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
              className="tavern-sched-action is-danger"
              onClick={() => setConfirming(task.id)}
            >
              Delete
            </button>
          )}
        </div>
      </>
    );
  }

  return (
    <section className="tavern-sched-section" aria-label="Scheduled tasks">
      <p className="tavern-sched-label">Scheduled</p>
      {notice}
      {tasks.length === 0 ? (
        <div className="tavern-empty">
          Nothing scheduled. Ask {mascot} to do something regularly — "check the
          stocks every weekday morning" — and it lands here.
        </div>
      ) : (
        tasks.map((task) => (
          <div
            key={task.id}
            className={`tavern-sched is-card${task.enabled ? "" : " is-off"}`}
          >
            <button
              type="button"
              className="tavern-sched-open"
              onClick={() => setView({ kind: "detail", id: task.id })}
            >
              <span className="tavern-sched-name">{task.name}</span>
              <p className="tavern-sched-schedule">{task.schedule}</p>
              <span className="tavern-sched-meta">{meta(task)}</span>
            </button>
            <div className="tavern-sched-side">
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
              <button
                type="button"
                className="tavern-sched-action"
                aria-label={`Run ${task.name} now`}
                disabled={busy === task.id}
                onClick={() => runNow(task)}
              >
                {busy === task.id
                  ? "Running…"
                  : ran === task.id
                    ? "Ran ✓"
                    : "Run now"}
              </button>
            </div>
          </div>
        ))
      )}
      <button
        type="button"
        className="tavern-file-new"
        onClick={() => setView({ kind: "create", draft: emptyDraft() })}
      >
        ＋ New scheduled task
      </button>
    </section>
  );
}
