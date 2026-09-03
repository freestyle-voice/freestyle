import { DataSkeleton } from "@renderer/components/data-skeleton";
import { DeleteConfirmationDialog } from "@renderer/components/delete-confirmation-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@renderer/components/ui/dialog";
import { capture } from "@renderer/lib/analytics";
import {
  setDeletionConfirmationSkipped,
  shouldSkipDeletionConfirmation,
} from "@renderer/lib/deletion-confirmation";
import { queryKeys, scheduledTasksQueryOptions } from "@renderer/lib/query";
import {
  clearRunNow,
  runNowSnapshot,
  startRunNow,
  subscribeRunNow,
} from "@renderer/lib/run-now-store";
import {
  createScheduledTask,
  deleteScheduledTask,
  type ScheduledTaskInput,
  type ScheduledTaskView,
  updateScheduledTask,
} from "@renderer/lib/scheduled-tasks";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarClock, Pencil, Play, Plus, Trash2 } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

type Editor = { id: string | null; draft: ScheduledTaskInput };
type ScheduledTasksVariant = "compact" | "workspace";

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
  const label = (suffix: string): string =>
    prefix ? `${prefix} ${suffix}` : suffix;
  if (abs >= 60 * 24) return label(when);
  return diffMin < 0 ? label(`${when} ago`) : label(`in ${when}`);
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

function ScheduleEditorDialog({
  editor,
  busy,
  onDraft,
  onSave,
  onClose,
}: {
  editor: Editor | null;
  busy: boolean;
  onDraft: (draft: ScheduledTaskInput) => void;
  onSave: () => void;
  onClose: () => void;
}): React.JSX.Element {
  const creating = editor?.id === null;
  return (
    <Dialog
      open={Boolean(editor)}
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="tavern-schedule-dialog">
        <DialogHeader>
          <DialogTitle>
            {creating ? "New schedule" : "Edit schedule"}
          </DialogTitle>
          <DialogDescription>
            {creating
              ? "Give Remix a recurring piece of work to take care of."
              : "Change what runs and when it should happen."}
          </DialogDescription>
        </DialogHeader>
        {editor ? (
          <TaskForm
            draft={editor.draft}
            onDraft={onDraft}
            onSave={onSave}
            onCancel={onClose}
            busy={busy}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function ScheduledTasks({
  mascot = "Freestyle",
  onOpenThread,
  variant = "compact",
  workspaceHeader = true,
  createRequest = 0,
}: {
  mascot?: string;
  onOpenThread?: (threadId: string, title: string) => void;
  variant?: ScheduledTasksVariant;
  /** The outer Remix workspace owns this header when it renders one. */
  workspaceHeader?: boolean;
  /** Changes when an outer workspace header requests a new-schedule dialog. */
  createRequest?: number;
}): React.JSX.Element {
  const queryClient = useQueryClient();
  const tasksQuery = useQuery(scheduledTasksQueryOptions());
  const tasks = tasksQuery.data ?? [];
  const runStates = useSyncExternalStore(
    subscribeRunNow,
    runNowSnapshot,
    runNowSnapshot,
  );
  const [editor, setEditor] = useState<Editor | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pendingDeletion, setPendingDeletion] =
    useState<ScheduledTaskView | null>(null);
  const lastCreateRequestRef = useRef(createRequest);
  const [error, setError] = useState<string | null>(null);

  const openEditor = (next: Editor): void => {
    setError(null);
    setEditor(next);
  };

  const closeEditor = (): void => {
    setEditor(null);
  };

  useEffect(() => {
    if (createRequest === lastCreateRequestRef.current) return;
    lastCreateRequestRef.current = createRequest;
    setError(null);
    setPendingDeletion(null);
    setEditor({ id: null, draft: emptyDraft() });
  }, [createRequest]);

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
    setError(null);
    startRunNow(queryClient, task);
  };

  const runControls = (task: ScheduledTaskView): React.JSX.Element => {
    const runState = runStates.get(task.id);
    const running = runState?.status === "running";
    return (
      <>
        <button
          type="button"
          className={
            variant === "workspace"
              ? "tavern-schedule-run"
              : "tavern-sched-action"
          }
          aria-label={`Run ${task.name} now`}
          disabled={running}
          onClick={() => runNow(task)}
        >
          {variant === "workspace" ? <Play aria-hidden="true" /> : null}
          {running
            ? "Running…"
            : runState?.status === "ran"
              ? "Ran ✓"
              : "Run now"}
        </button>
        {runState?.status === "ran" && runState.threadId && onOpenThread ? (
          <button
            type="button"
            className={
              variant === "workspace"
                ? "tavern-schedule-view-brief"
                : "tavern-sched-action"
            }
            onClick={() => {
              const threadId = runState.threadId;
              clearRunNow(task.id);
              if (threadId) onOpenThread(threadId, task.name);
            }}
          >
            View brief
          </button>
        ) : null}
      </>
    );
  };

  const runNotices = (ids: string[]): React.JSX.Element[] =>
    ids.flatMap((id) => {
      const runState = runStates.get(id);
      if (runState?.status !== "error") return [];
      const task = tasks.find((entry) => entry.id === id);
      return [
        <p key={`run-${id}`} className="tavern-notice" role="alert">
          {task ? `${task.name}: ` : ""}
          {runState.message}
        </p>,
      ];
    });

  const remove = (task: ScheduledTaskView): void => {
    setBusy(task.id);
    capture("scheduled_task_deleted", { task: task.name });
    void deleteScheduledTask(task.id)
      .then(() => {
        closeEditor();
        void refresh();
      })
      .catch(fail("Couldn’t delete that task."))
      .finally(() => setBusy(null));
  };

  const requestRemove = (task: ScheduledTaskView): void => {
    setError(null);
    if (shouldSkipDeletionConfirmation("schedule")) {
      remove(task);
      return;
    }
    setPendingDeletion(task);
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
        closeEditor();
      })
      .catch(fail("Couldn’t save that task."))
      .finally(() => setBusy(null));
  };

  const notice = error ? (
    <p className="tavern-notice" role="alert">
      {error}
    </p>
  ) : null;

  const refreshFailed =
    tasksQuery.isError && tasksQuery.data ? (
      <p className="tavern-notice" role="alert">
        Couldn&apos;t refresh scheduled tasks — showing the last loaded list.
      </p>
    ) : null;

  if (tasksQuery.isLoading)
    return <DataSkeleton label="Loading scheduled tasks" />;
  if (tasksQuery.isError && !tasksQuery.data) {
    return (
      <div className="tavern-empty">
        <p>Couldn&apos;t load scheduled tasks.</p>
        <button type="button" onClick={() => void tasksQuery.refetch()}>
          Try again
        </button>
      </div>
    );
  }

  const taskCards = tasks.map((task) => {
    const running = runStates.get(task.id)?.status === "running";
    const actions = (
      <div className="tavern-schedule-actions">
        <button
          type="button"
          className={
            variant === "workspace"
              ? "tavern-schedule-edit"
              : "tavern-sched-action"
          }
          onClick={() => openEditor({ id: task.id, draft: draftOf(task) })}
        >
          {variant === "workspace" ? <Pencil aria-hidden="true" /> : null}
          {variant === "workspace" ? "Edit schedule" : "Edit"}
        </button>
        {runControls(task)}
        {variant === "workspace" ? (
          <button
            type="button"
            className="tavern-schedule-delete"
            aria-label={`Delete ${task.name}`}
            title={`Delete ${task.name}`}
            disabled={busy === task.id}
            onClick={() => requestRemove(task)}
          >
            <Trash2 aria-hidden="true" />
          </button>
        ) : null}
      </div>
    );

    if (variant !== "workspace") {
      return (
        <div
          key={task.id}
          className={`tavern-sched is-card${task.enabled ? "" : " is-off"}`}
        >
          <div className="tavern-sched-open">
            <span className="tavern-sched-name">{task.name}</span>
            <p className="tavern-sched-schedule">{task.schedule}</p>
            <p className="tavern-sched-instruction">{task.instruction}</p>
            <span className="tavern-sched-meta">{meta(task)}</span>
          </div>
          <div className="tavern-sched-side">
            <button
              type="button"
              className={`tavern-sched-toggle${task.enabled ? " is-on" : ""}`}
              role="switch"
              aria-checked={task.enabled}
              aria-label={`${task.name} enabled`}
              disabled={busy === task.id || running}
              onClick={() => toggle(task)}
            >
              {task.enabled ? "On" : "Off"}
            </button>
            {actions}
          </div>
        </div>
      );
    }

    return (
      <article
        key={task.id}
        className={`tavern-schedule-card${task.enabled ? "" : " is-paused"}`}
      >
        <div className="tavern-schedule-card-head">
          <div className="tavern-schedule-card-title">
            <span className="tavern-schedule-card-icon" aria-hidden="true">
              <CalendarClock />
            </span>
            <div>
              <h3>{task.name}</h3>
              <p>{task.schedule}</p>
            </div>
          </div>
          <button
            type="button"
            className={`tavern-schedule-state${task.enabled ? " is-on" : ""}`}
            role="switch"
            aria-checked={task.enabled}
            aria-label={`${task.name} enabled`}
            disabled={busy === task.id || running}
            onClick={() => toggle(task)}
          >
            {task.enabled ? "Active" : "Paused"}
          </button>
        </div>
        <p className="tavern-schedule-prompt">{task.instruction}</p>
        <dl className="tavern-schedule-timing">
          <div>
            <dt>Next</dt>
            <dd>
              {task.enabled
                ? (relative(task.nextDueAt, "") ?? "Not scheduled")
                : "Paused"}
            </dd>
          </div>
          <div>
            <dt>Last run</dt>
            <dd>{relative(task.lastCompletedAt, "") ?? "Not yet"}</dd>
          </div>
          <div>
            <dt>Timezone</dt>
            <dd>{task.timezone}</dd>
          </div>
        </dl>
        {actions}
      </article>
    );
  });

  const empty = (
    <div className="tavern-empty tavern-sched-empty">
      Nothing scheduled. Ask {mascot} to do something regularly — "check the
      stocks every weekday morning" — and it lands here.
    </div>
  );

  return (
    <>
      {variant === "workspace" ? (
        <section className="tavern-schedule-page" aria-label="Scheduled tasks">
          {workspaceHeader ? (
            <header className="tavern-schedule-page-head">
              <div>
                <h2>Schedules</h2>
                <p>Work Remix keeps moving in the background.</p>
              </div>
              <div className="tavern-schedule-page-actions">
                <button
                  type="button"
                  className="tavern-schedule-create"
                  onClick={() => openEditor({ id: null, draft: emptyDraft() })}
                >
                  <Plus aria-hidden="true" />
                  New schedule
                </button>
              </div>
            </header>
          ) : null}
          {notice}
          {refreshFailed}
          {runNotices(tasks.map((task) => task.id))}
          <div className="tavern-schedule-grid">
            {tasks.length === 0 ? empty : taskCards}
          </div>
        </section>
      ) : (
        <section className="tavern-sched-section" aria-label="Scheduled tasks">
          <p className="tavern-sched-label">Scheduled</p>
          {notice}
          {refreshFailed}
          {runNotices(tasks.map((task) => task.id))}
          {tasks.length === 0 ? empty : taskCards}
          <button
            type="button"
            className="tavern-file-new tavern-sched-new"
            onClick={() => openEditor({ id: null, draft: emptyDraft() })}
          >
            ＋ New scheduled task
          </button>
        </section>
      )}
      <ScheduleEditorDialog
        editor={editor}
        busy={busy === (editor?.id ?? "new")}
        onDraft={(draft) => {
          if (editor) setEditor({ ...editor, draft });
        }}
        onSave={() => {
          if (editor) save(editor.id, editor.draft);
        }}
        onClose={closeEditor}
      />
      <DeleteConfirmationDialog
        open={pendingDeletion !== null}
        scope="schedule"
        title={
          pendingDeletion
            ? `Delete ${pendingDeletion.name}?`
            : "Delete schedule?"
        }
        description="This permanently removes the schedule."
        confirmLabel="Delete schedule"
        busy={pendingDeletion ? busy === pendingDeletion.id : false}
        onOpenChange={(open) => {
          if (!open) setPendingDeletion(null);
        }}
        onConfirm={(skipConfirmation) => {
          const task = pendingDeletion;
          setPendingDeletion(null);
          if (!task) return;
          if (skipConfirmation)
            setDeletionConfirmationSkipped("schedule", true);
          remove(task);
        }}
      />
    </>
  );
}
