import { DataSkeleton } from "@renderer/components/data-skeleton";
import type { RemixInspectorTarget } from "@renderer/components/remix-inspector";
import { usePersistentState } from "@renderer/hooks/use-persistent-state";
import { useRemixTaskEditor } from "@renderer/hooks/use-remix-task-editor";
import { listBrainFiles } from "@renderer/lib/brain-fs";
import { notesQueryOptions, queryKeys } from "@renderer/lib/query";
import type { RemixRunState } from "@renderer/lib/remix-run-state";
import { parseRemixTodos, REMIX_TODOS_PATH } from "@renderer/lib/remix-tasks";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Brain,
  ChevronDown,
  FileText,
  ListTodo,
  Plus,
} from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import { TaskSaveFeedback } from "./task-save-feedback";

export type RemixContextKind = "tasks" | "notes" | "brain" | "run";

const PREVIEW_LIMIT = 3;

function dateLabel(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function fileLabel(path: string): string {
  return (
    path.replace(/\\/g, "/").split("/").at(-1)?.replace(/\.md$/, "") ?? path
  );
}

function brainFileTitle(path: string): string {
  return fileLabel(path)
    .toLocaleLowerCase()
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toLocaleUpperCase());
}

function brainFileMeta(path: string, modified: number): string {
  const segments = path.replace(/\\/g, "/").split("/");
  const folder = segments.slice(0, -1).join("/") || "Workspace";
  return `${folder} · Updated ${dateLabel(modified)}`;
}

function ContextCard({
  kind,
  title,
  count,
  attention,
  empty = false,
  onOpen,
  children,
}: {
  kind: RemixContextKind;
  title: string;
  count?: number;
  attention: boolean;
  empty?: boolean;
  onOpen?: () => void;
  children: React.ReactNode;
}): React.JSX.Element {
  const Icon =
    kind === "tasks"
      ? ListTodo
      : kind === "notes"
        ? FileText
        : kind === "brain"
          ? Brain
          : Activity;

  return (
    <section
      className={`remix-context-card${attention ? " is-attention" : ""}`}
      data-context-kind={kind}
      data-empty={empty || undefined}
      aria-label={title}
    >
      <header className="remix-context-card-head">
        <button
          type="button"
          className="remix-context-card-title"
          onClick={onOpen}
          disabled={!onOpen}
        >
          <span className="remix-context-card-icon">
            <Icon aria-hidden="true" />
          </span>
          <span>{title}</span>
        </button>
        {count !== undefined ? (
          <span className="remix-context-card-count">{count}</span>
        ) : null}
      </header>
      {children}
    </section>
  );
}

function ContextTasks({
  attention,
  onOpenInspector,
}: {
  attention: boolean;
  onOpenInspector?: (target: RemixInspectorTarget) => void;
}): React.JSX.Element {
  const editor = useRemixTaskEditor();
  const tasksQuery = editor.query;
  const { draft, setDraft } = editor;
  const [expanded, setExpanded] = useState(false);
  const { items } = parseRemixTodos(tasksQuery.data);
  const openItems = items.filter((item) => !item.done);
  const shown = expanded ? items : openItems.slice(0, PREVIEW_LIMIT);

  return (
    <ContextCard
      kind="tasks"
      title="Tasks"
      count={openItems.length}
      attention={attention}
      empty={
        !tasksQuery.isLoading && !tasksQuery.isError && openItems.length === 0
      }
      onOpen={
        onOpenInspector ? () => onOpenInspector({ kind: "tasks" }) : undefined
      }
    >
      {tasksQuery.isLoading ? (
        <DataSkeleton label="Loading tasks" variant="tasks" />
      ) : tasksQuery.isError ? (
        <p className="remix-context-empty">Couldn&apos;t load tasks.</p>
      ) : shown.length > 0 ? (
        <div className="remix-context-list">
          {shown.map((item) => (
            <label
              key={`${item.line}-${item.text}`}
              className="remix-context-task"
            >
              <input
                type="checkbox"
                checked={item.done}
                disabled={editor.pending}
                onChange={() => editor.toggle(item)}
              />
              <span>{item.text}</span>
            </label>
          ))}
        </div>
      ) : (
        <p className="remix-context-empty">Nothing waiting on you.</p>
      )}
      {items.length > PREVIEW_LIMIT ? (
        <button
          className="remix-context-view-all"
          type="button"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Show less" : `View all ${items.length}`}
          <ChevronDown
            className={expanded ? "is-open" : ""}
            aria-hidden="true"
          />
        </button>
      ) : null}
      <TaskSaveFeedback editor={editor} />
      <label className="remix-context-add">
        <Plus aria-hidden="true" />
        <input
          aria-label="Add a task"
          value={draft}
          disabled={
            editor.pending || (!tasksQuery.data && !tasksQuery.isSuccess)
          }
          placeholder="Add a task…"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            const text = draft.trim();
            if (!text) return;
            event.preventDefault();
            editor.add();
          }}
        />
      </label>
    </ContextCard>
  );
}

function ContextNotes({
  attention,
  onOpenInspector,
}: {
  attention: boolean;
  onOpenInspector?: (target: RemixInspectorTarget) => void;
}): React.JSX.Element {
  const notesQuery = useQuery(notesQueryOptions());
  const [expanded, setExpanded] = useState(false);
  const notes = notesQuery.data ?? [];
  const shown = expanded ? notes : notes.slice(0, PREVIEW_LIMIT);

  return (
    <ContextCard
      kind="notes"
      title="Notes"
      count={notes.length}
      attention={attention}
      empty={!notesQuery.isLoading && !notesQuery.isError && notes.length === 0}
      onOpen={
        onOpenInspector ? () => onOpenInspector({ kind: "notes" }) : undefined
      }
    >
      {notesQuery.isLoading ? (
        <DataSkeleton label="Loading notes" variant="notes" />
      ) : notesQuery.isError ? (
        <p className="remix-context-empty">Couldn&apos;t load notes.</p>
      ) : notes.length === 0 ? (
        <p className="remix-context-empty">Ask Remix to save a note.</p>
      ) : (
        <div className="remix-context-list">
          {shown.map((note) => (
            <button
              key={note.path}
              type="button"
              className="remix-context-row"
              onClick={() => {
                onOpenInspector?.({
                  kind: "file",
                  path: note.path,
                  title: note.title,
                });
              }}
            >
              <strong>{note.title}</strong>
              <span>{note.snippet || dateLabel(note.modified)}</span>
            </button>
          ))}
        </div>
      )}
      {notes.length > PREVIEW_LIMIT ? (
        <button
          className="remix-context-view-all"
          type="button"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Show less" : `View all ${notes.length} notes`}
          <ChevronDown
            className={expanded ? "is-open" : ""}
            aria-hidden="true"
          />
        </button>
      ) : null}
    </ContextCard>
  );
}

function ContextBrain({
  attention,
  onOpenInspector,
}: {
  attention: boolean;
  onOpenInspector?: (target: RemixInspectorTarget) => void;
}): React.JSX.Element {
  const filesQuery = useQuery({
    queryKey: queryKeys.brain.files(""),
    queryFn: () => listBrainFiles(),
  });
  const [expanded, setExpanded] = useState(false);
  const files = useMemo(
    () =>
      (filesQuery.data ?? [])
        .filter((file) => {
          const path = file.path.replace(/\\/g, "/");
          return path !== REMIX_TODOS_PATH && !path.startsWith("notes/");
        })
        .sort((left, right) => right.modified - left.modified),
    [filesQuery.data],
  );
  const shown = expanded ? files : files.slice(0, PREVIEW_LIMIT);

  return (
    <ContextCard
      kind="brain"
      title="Brain"
      count={files.length}
      attention={attention}
      empty={!filesQuery.isLoading && !filesQuery.isError && files.length === 0}
      onOpen={
        onOpenInspector ? () => onOpenInspector({ kind: "brain" }) : undefined
      }
    >
      {filesQuery.isLoading ? (
        <DataSkeleton label="Loading Brain" variant="files" />
      ) : filesQuery.isError ? (
        <p className="remix-context-empty">Couldn&apos;t load Brain.</p>
      ) : files.length === 0 ? (
        <p className="remix-context-empty">
          Remix will remember useful things here.
        </p>
      ) : (
        <div className="remix-context-list">
          {shown.map((file) => (
            <button
              key={file.path}
              type="button"
              className="remix-context-row remix-context-file"
              onClick={() => {
                onOpenInspector?.({
                  kind: "file",
                  path: file.path,
                  title: brainFileTitle(file.path),
                });
              }}
            >
              <span className="remix-context-file-icon">
                <FileText aria-hidden="true" />
              </span>
              <span className="remix-context-file-copy">
                <strong>{brainFileTitle(file.path)}</strong>
                <span>{brainFileMeta(file.path, file.modified)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      {files.length > PREVIEW_LIMIT ? (
        <button
          className="remix-context-view-all"
          type="button"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Show less" : `View all ${files.length} files`}
          <ChevronDown
            className={expanded ? "is-open" : ""}
            aria-hidden="true"
          />
        </button>
      ) : null}
    </ContextCard>
  );
}

function RemixRunCard({
  run,
  onOpenInspector,
}: {
  run: RemixRunState;
  onOpenInspector?: (target: RemixInspectorTarget) => void;
}): React.JSX.Element {
  const needsAttention =
    run.state === "approval" ||
    run.state === "desktop" ||
    run.state === "attention";

  return (
    <ContextCard
      kind="run"
      title="Run"
      attention={needsAttention}
      empty={run.state === "idle"}
      onOpen={
        onOpenInspector
          ? () => onOpenInspector({ kind: "run", run })
          : undefined
      }
    >
      <div className="remix-context-run-state" data-state={run.state}>
        <strong>{run.title}</strong>
        <span>{run.detail}</span>
      </div>
    </ContextCard>
  );
}

export function RemixContextRail({
  attention,
  open,
  run,
  onOpenInspector,
}: {
  attention: RemixContextKind | null;
  open: boolean;
  run: RemixRunState;
  onOpenInspector?: (target: RemixInspectorTarget) => void;
}): React.JSX.Element {
  return (
    <aside
      className="remix-context-rail"
      aria-hidden={!open}
      aria-label="Conversation context"
      inert={!open}
    >
      <RemixRunCard run={run} onOpenInspector={onOpenInspector} />
      <ContextTasks
        attention={attention === "tasks"}
        onOpenInspector={onOpenInspector}
      />
      <ContextNotes
        attention={attention === "notes"}
        onOpenInspector={onOpenInspector}
      />
      <ContextBrain
        attention={attention === "brain"}
        onOpenInspector={onOpenInspector}
      />
    </aside>
  );
}

export function useRemixContextRailVisibility(): [
  boolean,
  (open: boolean) => void,
] {
  const [value, setValue] = usePersistentState<"open" | "closed">(
    "remix.contextRail",
    "open",
    (stored): stored is "open" | "closed" =>
      stored === "open" || stored === "closed",
  );
  return [value === "open", (open) => setValue(open ? "open" : "closed")];
}
