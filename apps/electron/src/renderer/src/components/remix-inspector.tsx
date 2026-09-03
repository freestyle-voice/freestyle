import { DataSkeleton } from "@renderer/components/data-skeleton";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@renderer/components/ui/breadcrumb";
import { usePersistentState } from "@renderer/hooks/use-persistent-state";
import { listBrainFiles, writeBrainFile } from "@renderer/lib/brain-fs";
import {
  brainFileQueryOptions,
  notesQueryOptions,
  queryKeys,
} from "@renderer/lib/query";
import {
  appendRemixTodo,
  parseRemixTodos,
  REMIX_TODOS_PATH,
  toggleRemixTodo,
} from "@renderer/lib/remix-tasks";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Brain,
  Check,
  FileText,
  ListTodo,
  RotateCcw,
  Save,
} from "lucide-react";
import type React from "react";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";

const INSPECTOR_WIDTH_MIN = 360;
const INSPECTOR_WIDTH_MAX = 760;
const DEFAULT_INSPECTOR_WIDTH = 520;

export type RemixInspectorTarget =
  | { kind: "tasks" }
  | { kind: "notes" }
  | { kind: "brain" }
  | { kind: "file"; path: string; title?: string };

type InspectorTab = RemixInspectorTarget & { id: string; title: string };

function clampWidth(width: number): number {
  return Math.min(INSPECTOR_WIDTH_MAX, Math.max(INSPECTOR_WIDTH_MIN, width));
}

function tabFor(target: RemixInspectorTarget): InspectorTab {
  if (target.kind === "tasks")
    return { ...target, id: "tasks", title: "Tasks" };
  if (target.kind === "notes")
    return { ...target, id: "notes", title: "Notes" };
  if (target.kind === "brain")
    return { ...target, id: "brain", title: "Brain" };
  return {
    ...target,
    id: `file:${target.path}`,
    title:
      target.title ??
      target.path.replace(/\\/g, "/").split("/").at(-1)?.replace(/\.md$/, "") ??
      target.path,
  };
}

function InspectorFile({ path }: { path: string }): React.JSX.Element {
  const queryClient = useQueryClient();
  const fileQuery = useQuery(brainFileQueryOptions(path));
  const [draft, setDraft] = useState("");
  const [loadedPath, setLoadedPath] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    if (
      loadedPath !== path &&
      fileQuery.data !== undefined &&
      fileQuery.data !== null
    ) {
      setDraft(fileQuery.data);
      setLoadedPath(path);
    }
  }, [fileQuery.data, loadedPath, path]);

  const save = (): void => {
    if (saving || draft === (fileQuery.data ?? "")) return;
    setSaving(true);
    setSaveError(false);
    void writeBrainFile(path, draft)
      .then((saved) => {
        if (!saved) {
          setSaveError(true);
          return;
        }
        queryClient.setQueryData(queryKeys.brain.file(path), draft);
        void queryClient.invalidateQueries({
          queryKey: queryKeys.brain.files(""),
        });
      })
      .catch(() => setSaveError(true))
      .finally(() => setSaving(false));
  };

  if (fileQuery.isLoading) {
    return <DataSkeleton label="Loading file" variant="files" />;
  }
  if (fileQuery.isError || fileQuery.data === null) {
    return (
      <div className="remix-inspector-empty">
        <p>Couldn&apos;t open this file.</p>
        <button type="button" onClick={() => void fileQuery.refetch()}>
          Try again
        </button>
      </div>
    );
  }

  const isDirty = draft !== (fileQuery.data ?? "");
  const normalizedPath = path.replace(/\\/g, "/");
  const pathSegments = normalizedPath.split("/");
  const fileName = pathSegments.at(-1) ?? normalizedPath;
  const directorySegments = pathSegments.slice(0, -1);

  return (
    <section className="remix-inspector-document" aria-label={path}>
      <div className="remix-inspector-document-head">
        <Breadcrumb
          className="remix-inspector-document-location"
          title={normalizedPath}
        >
          <BreadcrumbList>
            <BreadcrumbItem>
              <span>Brain</span>
            </BreadcrumbItem>
            {directorySegments.map((segment, index) => (
              <Fragment key={`${segment}-${index}`}>
                <BreadcrumbSeparator>/</BreadcrumbSeparator>
                <BreadcrumbItem>
                  <span>{segment}</span>
                </BreadcrumbItem>
              </Fragment>
            ))}
            <BreadcrumbSeparator>/</BreadcrumbSeparator>
            <BreadcrumbItem>
              <BreadcrumbPage>{fileName}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="remix-inspector-document-actions">
          {isDirty ? (
            <>
              <span className="remix-inspector-document-state is-dirty">
                Edited
              </span>
              <div className="remix-inspector-document-action-group">
                <button
                  type="button"
                  className="remix-inspector-revert"
                  aria-label="Revert changes"
                  title="Revert changes"
                  onClick={() => {
                    setDraft(fileQuery.data ?? "");
                    setSaveError(false);
                  }}
                >
                  <RotateCcw aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="remix-inspector-save"
                  disabled={saving}
                  onClick={save}
                >
                  <Save aria-hidden="true" />
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </>
          ) : null}
          {!isDirty ? (
            <span className="remix-inspector-document-state" aria-live="polite">
              <Check aria-hidden="true" /> Saved
            </span>
          ) : null}
          {saveError ? (
            <span className="remix-inspector-document-error" role="alert">
              Couldn&apos;t save
            </span>
          ) : null}
        </div>
      </div>
      <textarea
        className="remix-inspector-editor"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (
            (event.metaKey || event.ctrlKey) &&
            event.key.toLowerCase() === "s"
          ) {
            event.preventDefault();
            if (isDirty) save();
          }
        }}
      />
    </section>
  );
}

function InspectorTasks(): React.JSX.Element {
  const queryClient = useQueryClient();
  const tasksQuery = useQuery(brainFileQueryOptions(REMIX_TODOS_PATH));
  const [draft, setDraft] = useState("");
  const { lines, items } = parseRemixTodos(tasksQuery.data);

  const save = (next: string[]): void => {
    const text = next.join("\n");
    queryClient.setQueryData(queryKeys.brain.file(REMIX_TODOS_PATH), text);
    void writeBrainFile(REMIX_TODOS_PATH, text)
      .then((saved) => {
        if (saved) return;
        void queryClient.invalidateQueries({
          queryKey: queryKeys.brain.file(REMIX_TODOS_PATH),
        });
      })
      .catch(() => {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.brain.file(REMIX_TODOS_PATH),
        });
      });
  };

  if (tasksQuery.isLoading) {
    return <DataSkeleton label="Loading tasks" variant="tasks" />;
  }
  if (tasksQuery.isError) {
    return (
      <div className="remix-inspector-empty">
        <p>Couldn&apos;t load tasks.</p>
        <button type="button" onClick={() => void tasksQuery.refetch()}>
          Try again
        </button>
      </div>
    );
  }

  return (
    <section className="remix-inspector-tasks" aria-label="Tasks">
      {items.length > 0 ? (
        <div className="remix-inspector-task-list">
          {items.map((item) => (
            <label key={`${item.line}-${item.text}`}>
              <input
                type="checkbox"
                checked={item.done}
                onChange={() => save(toggleRemixTodo(lines, item))}
              />
              <span>{item.text}</span>
            </label>
          ))}
        </div>
      ) : (
        <p className="remix-inspector-empty-copy">Nothing waiting on you.</p>
      )}
      <label className="remix-inspector-task-add">
        <span>+</span>
        <input
          aria-label="Add a task"
          value={draft}
          placeholder="Add a task…"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            const text = draft.trim();
            if (!text) return;
            event.preventDefault();
            setDraft("");
            save(appendRemixTodo(lines, text));
          }}
        />
      </label>
    </section>
  );
}

function InspectorCollection({
  kind,
  onOpenFile,
}: {
  kind: "notes" | "brain";
  onOpenFile: (target: RemixInspectorTarget) => void;
}): React.JSX.Element {
  const notesQuery = useQuery({
    ...notesQueryOptions(),
    enabled: kind === "notes",
  });
  const brainQuery = useQuery({
    queryKey: queryKeys.brain.files(""),
    queryFn: () => listBrainFiles(),
    enabled: kind === "brain",
  });
  const items = useMemo(() => {
    if (kind === "notes") {
      return (notesQuery.data ?? []).map((note) => ({
        path: note.path,
        title: note.title,
        detail: note.snippet || "Note",
      }));
    }
    return (brainQuery.data ?? [])
      .filter((file) => {
        const path = file.path.replace(/\\/g, "/");
        return path !== "todos.md" && !path.startsWith("notes/");
      })
      .sort((left, right) => right.modified - left.modified)
      .map((file) => ({
        path: file.path,
        title: file.path.split("/").at(-1)?.replace(/\.md$/, "") ?? file.path,
        detail: file.path.split("/").slice(0, -1).join("/") || "Workspace",
      }));
  }, [brainQuery.data, kind, notesQuery.data]);
  const query = kind === "notes" ? notesQuery : brainQuery;

  if (query.isLoading) {
    return <DataSkeleton label={`Loading ${kind}`} variant="files" />;
  }
  if (query.isError) {
    return (
      <div className="remix-inspector-empty">
        <p>Couldn&apos;t load {kind}.</p>
        <button type="button" onClick={() => void query.refetch()}>
          Try again
        </button>
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="remix-inspector-empty">
        <p>
          {kind === "notes"
            ? "Ask Remix to save a note."
            : "Your Brain is ready when you are."}
        </p>
      </div>
    );
  }

  return (
    <div className="remix-inspector-file-list">
      {items.map((item) => (
        <button
          key={item.path}
          type="button"
          onClick={() =>
            onOpenFile({ kind: "file", path: item.path, title: item.title })
          }
        >
          <FileText aria-hidden="true" />
          <span>
            <strong>{item.title}</strong>
            <small>{item.detail}</small>
          </span>
        </button>
      ))}
    </div>
  );
}

function InspectorContent({
  tab,
  onOpenFile,
}: {
  tab: InspectorTab;
  onOpenFile: (target: RemixInspectorTarget) => void;
}): React.JSX.Element {
  if (tab.kind === "file") return <InspectorFile path={tab.path} />;
  if (tab.kind === "tasks") return <InspectorTasks />;

  return <InspectorCollection kind={tab.kind} onOpenFile={onOpenFile} />;
}

export function RemixInspector({
  target,
}: {
  target: RemixInspectorTarget | null;
}): React.JSX.Element | null {
  const [widthRaw, setWidthRaw] = usePersistentState<string>(
    "remix.inspectorWidth",
    String(DEFAULT_INSPECTOR_WIDTH),
    (value): value is string => /^\d+$/.test(value),
  );
  const width = clampWidth(Number(widthRaw) || DEFAULT_INSPECTOR_WIDTH);
  const [tabs, setTabs] = useState<InspectorTab[]>(() =>
    target ? [tabFor(target)] : [],
  );
  const [activeId, setActiveId] = useState(() =>
    target ? tabFor(target).id : "",
  );

  const openTab = useCallback((next: RemixInspectorTarget) => {
    const tab = tabFor(next);
    setTabs((current) =>
      current.some((candidate) => candidate.id === tab.id)
        ? current
        : [...current, tab],
    );
    setActiveId(tab.id);
  }, []);

  useEffect(() => {
    if (target) openTab(target);
  }, [openTab, target]);

  const onResizeStart = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const onMove = (moveEvent: PointerEvent): void =>
      setWidthRaw(
        String(clampWidth(Math.round(window.innerWidth - moveEvent.clientX))),
      );
    const onFinish = (finishEvent: PointerEvent): void => {
      if (handle.hasPointerCapture(finishEvent.pointerId)) {
        handle.releasePointerCapture(finishEvent.pointerId);
      }
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onFinish);
      window.removeEventListener("pointercancel", onFinish);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onFinish);
    window.addEventListener("pointercancel", onFinish);
  };

  if (tabs.length === 0) return null;
  const active = tabs.find((tab) => tab.id === activeId) ?? tabs.at(-1)!;

  return (
    <aside
      className="remix-inspector"
      aria-label="Context inspector"
      style={{ "--remix-inspector-width": `${width}px` } as React.CSSProperties}
    >
      {/* biome-ignore lint/a11y/useSemanticElements: a focusable drag handle cannot be an hr */}
      <div
        className="remix-inspector-resize-handle"
        role="separator"
        tabIndex={0}
        aria-orientation="vertical"
        aria-label="Resize inspector"
        aria-valuenow={width}
        aria-valuemin={INSPECTOR_WIDTH_MIN}
        aria-valuemax={INSPECTOR_WIDTH_MAX}
        onPointerDown={onResizeStart}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft")
            setWidthRaw(String(clampWidth(width + 16)));
          if (event.key === "ArrowRight")
            setWidthRaw(String(clampWidth(width - 16)));
        }}
      />
      <header className="remix-inspector-head">
        <div
          className="remix-inspector-tabs"
          role="tablist"
          aria-label="Open context"
        >
          {tabs.map((tab) => (
            <div key={tab.id} className="remix-inspector-tab-wrap">
              <button
                type="button"
                role="tab"
                aria-selected={active.id === tab.id}
                data-remix-inspector-tab={tab.kind}
                onClick={() => setActiveId(tab.id)}
              >
                {tab.title}
              </button>
            </div>
          ))}
        </div>
      </header>
      <div className="remix-inspector-body" role="tabpanel">
        {tabs.map((tab) => (
          <div key={tab.id} hidden={tab.id !== active.id}>
            <InspectorContent tab={tab} onOpenFile={openTab} />
          </div>
        ))}
      </div>
    </aside>
  );
}

export const REMIX_INSPECTOR_ICONS = {
  tasks: ListTodo,
  notes: FileText,
  brain: Brain,
};
