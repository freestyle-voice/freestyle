import { DataSkeleton } from "@renderer/components/data-skeleton";
import { Markdown } from "@renderer/components/markdown";
import { ScheduledTasks } from "@renderer/components/scheduled-tasks";
import { capture } from "@renderer/lib/analytics";
import {
  deleteBrainFile,
  type BrainFile as HomeFile,
  listBrainFiles,
  readBrainFile,
  uniqueBrainPath,
  writeBrainFile,
} from "@renderer/lib/brain-fs";
import { queryKeys } from "@renderer/lib/query";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Pencil, Save, Trash2, X } from "lucide-react";
import type React from "react";
import { Fragment, useState } from "react";

type FileView =
  | { kind: "list" }
  | { kind: "loading"; path: string }
  | { kind: "view"; path: string; text: string }
  | { kind: "edit"; path: string; draft: string; saved: string }
  | { kind: "create"; name: string; draft: string };

function slugify(name: string): string {
  const segments = name
    .split("/")
    .map((seg) =>
      seg
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
    )
    .filter(Boolean);
  return segments.join("/") || "untitled";
}

function FileEditor({
  label,
  draft,
  dirty,
  onDraft,
  onSave,
  onCancel,
}: {
  label: string;
  draft: string;
  dirty: boolean;
  onDraft: (text: string) => void;
  onSave: () => void;
  onCancel: () => void;
}): React.JSX.Element {
  return (
    <section className="tavern-brain-document" aria-label={`Editing ${label}`}>
      <div className="tavern-brain-document-head">
        <span className="tavern-brain-document-title">
          <FileText aria-hidden="true" />
          {label}
          {dirty ? <span aria-label="Unsaved changes" role="status" /> : null}
        </span>
        <span className="tavern-brain-document-mode">Editing</span>
      </div>
      <textarea
        className="tavern-editor"
        value={draft}
        onChange={(e) => onDraft(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
            e.preventDefault();
            onSave();
          } else if (e.key === "Escape") {
            e.stopPropagation();
            onCancel();
          }
        }}
      />
      <div className="tavern-brain-document-actions">
        <button
          type="button"
          className="tavern-approve-btn tavern-approve-allow"
          onClick={onSave}
        >
          <Save aria-hidden="true" /> Save
        </button>
        <button type="button" className="tavern-approve-btn" onClick={onCancel}>
          <X aria-hidden="true" /> Cancel
        </button>
      </div>
    </section>
  );
}

interface TreeDir {
  name: string;
  path: string;
  dirs: TreeDir[];
  files: HomeFile[];
}

function buildTree(files: HomeFile[]): TreeDir {
  const rootDir: TreeDir = { name: "", path: "", dirs: [], files: [] };
  const dirFor = (segments: string[]): TreeDir => {
    let cur = rootDir;
    let acc = "";
    for (const seg of segments) {
      acc = acc ? `${acc}/${seg}` : seg;
      let next = cur.dirs.find((d) => d.path === acc);
      if (!next) {
        next = { name: seg, path: acc, dirs: [], files: [] };
        cur.dirs.push(next);
      }
      cur = next;
    }
    return cur;
  };
  for (const f of files) {
    const parts = f.path.replace(/\\/g, "/").split("/");
    const dir = dirFor(parts.slice(0, -1));
    dir.files.push({ ...f, path: f.path.replace(/\\/g, "/") });
  }
  const sortDir = (d: TreeDir): void => {
    d.dirs.sort((a, b) => a.name.localeCompare(b.name));
    d.files.sort((a, b) => a.path.localeCompare(b.path));
    d.dirs.forEach(sortDir);
  };
  sortDir(rootDir);
  return rootDir;
}

function FileTree({
  dir,
  depth,
  collapsed,
  onToggle,
  onOpen,
}: {
  dir: TreeDir;
  depth: number;
  collapsed: Set<string>;
  onToggle: (path: string) => void;
  onOpen: (path: string) => void;
}): React.JSX.Element {
  return (
    <>
      {dir.dirs.map((d) => (
        <Fragment key={d.path}>
          <button
            type="button"
            className="tavern-tree-row tavern-tree-dir"
            style={{ paddingLeft: 8 + depth * 16 }}
            onClick={() => onToggle(d.path)}
          >
            <span className="tavern-tree-caret">
              {collapsed.has(d.path) ? "▸" : "▾"}
            </span>
            {d.name}
          </button>
          {collapsed.has(d.path) ? null : (
            <FileTree
              dir={d}
              depth={depth + 1}
              collapsed={collapsed}
              onToggle={onToggle}
              onOpen={onOpen}
            />
          )}
        </Fragment>
      ))}
      {dir.files.map((f) => (
        <button
          key={f.path}
          type="button"
          className="tavern-tree-row"
          style={{ paddingLeft: 8 + depth * 16 + 14 }}
          onClick={() => onOpen(f.path)}
        >
          {(f.path.split("/").pop() ?? f.path).replace(/\.md$/, ".md")}
        </button>
      ))}
    </>
  );
}

export function BrainFiles({
  root,
  emptyText,
  newLabel,
  onOpenThread,
}: {
  root: string;
  emptyText: string;
  newLabel: string;
  onOpenThread?: (threadId: string) => void;
}): React.JSX.Element {
  const queryClient = useQueryClient();
  const filesQuery = useQuery({
    queryKey: queryKeys.brain.files(root),
    queryFn: () => listBrainFiles(root || undefined),
  });
  const files: HomeFile[] = filesQuery.data ?? [];
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [view, setView] = useState<FileView>({ kind: "list" });
  const [error, setError] = useState<string | null>(null);
  const scheduled = root === "";

  const openFile = (path: string): void => {
    setError(null);
    setView({ kind: "loading", path });
    void readBrainFile(path)
      .then((text) => {
        if (text === null) {
          setError("Couldn't open that file. Try again.");
          setView({ kind: "list" });
          return;
        }
        setView({ kind: "view", path, text });
      })
      .catch(() => {
        setError("Couldn't open that file. Try again.");
        setView({ kind: "list" });
      });
  };

  const saveFile = (path: string, text: string): void => {
    setError(null);
    void writeBrainFile(path, text)
      .then((ok) => {
        if (!ok) {
          setError("Couldn't save that file. Try again.");
          return;
        }
        void queryClient.invalidateQueries({ queryKey: queryKeys.brain.all });
        setView({ kind: "view", path, text });
      })
      .catch(() => setError("Couldn't save that file. Try again."));
  };

  const createFile = (name: string, text: string): void => {
    const wanted = `${root ? `${root}/` : ""}${slugify(name)}.md`;
    void uniqueBrainPath(wanted)
      .then((path) => saveFile(path, text))
      .catch(() => setError("Couldn't create that file. Try again."));
  };

  const removeFile = (path: string): void => {
    setError(null);
    void deleteBrainFile(path)
      .then((ok) => {
        if (!ok) {
          setError("Couldn't delete that file. Try again.");
          return;
        }
        setView({ kind: "list" });
        void queryClient.invalidateQueries({ queryKey: queryKeys.brain.all });
      })
      .catch(() => setError("Couldn't delete that file. Try again."));
  };

  const notice = error ? (
    <p className="tavern-notice" role="alert">
      {error}
    </p>
  ) : null;

  if (view.kind === "loading") {
    return (
      <>
        <button
          type="button"
          className="tavern-file-back"
          onClick={() => setView({ kind: "list" })}
        >
          ← {view.path.replace(/\\/g, "/")}
        </button>
        <DataSkeleton label="Loading Brain file" rows={4} variant="files" />
      </>
    );
  }

  if (view.kind === "view") {
    return (
      <section className="tavern-brain-document" aria-label={view.path}>
        {notice}
        <div className="tavern-brain-document-head">
          <button
            type="button"
            className="tavern-brain-document-title tavern-file-back"
            onClick={() => setView({ kind: "list" })}
          >
            <FileText aria-hidden="true" />
            {view.path.replace(/\\/g, "/")}
          </button>
          <span className="tavern-brain-document-actions">
            <button
              type="button"
              className="tavern-icon-button"
              title="Edit file"
              onClick={() =>
                setView({
                  kind: "edit",
                  path: view.path,
                  draft: view.text,
                  saved: view.text,
                })
              }
            >
              <Pencil aria-hidden="true" />
            </button>
            <button
              type="button"
              className="tavern-icon-button tavern-file-delete"
              title="Delete file"
              onClick={() => removeFile(view.path)}
            >
              <Trash2 aria-hidden="true" />
            </button>
          </span>
        </div>
        <div className="tavern-brain-document-preview">
          <Markdown text={view.text} />
        </div>
      </section>
    );
  }

  if (view.kind === "edit") {
    return (
      <>
        {notice}
        <FileEditor
          label={view.path.replace(/\\/g, "/")}
          draft={view.draft}
          dirty={view.draft !== view.saved}
          onDraft={(draft) => setView({ ...view, draft })}
          onSave={() => saveFile(view.path, view.draft)}
          onCancel={() =>
            setView({ kind: "view", path: view.path, text: view.saved })
          }
        />
      </>
    );
  }

  if (view.kind === "create") {
    return (
      <>
        {notice}
        <input
          className="tavern-editor-name"
          value={view.name}
          placeholder="File name"
          onChange={(e) => setView({ ...view, name: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setView({ kind: "list" });
            }
          }}
        />
        <FileEditor
          label={`${root ? `${root}/` : ""}${slugify(view.name)}.md`}
          draft={view.draft}
          dirty={view.draft.length > 0}
          onDraft={(draft) => setView({ ...view, draft })}
          onSave={() => {
            capture("brain_file_created", { folder: root || "root" });
            createFile(view.name, view.draft);
          }}
          onCancel={() => setView({ kind: "list" })}
        />
      </>
    );
  }

  return (
    <>
      {scheduled ? (
        <ScheduledTasks {...(onOpenThread ? { onOpenThread } : {})} />
      ) : null}
      <section
        className={`tavern-brain-files${scheduled ? " has-scheduled" : ""}`}
        aria-label="Brain files"
      >
        <div className="tavern-brain-files-head">
          <span>Files</span>
          {filesQuery.isSuccess ? <em>{files.length}</em> : null}
        </div>
        {filesQuery.isLoading ? (
          <DataSkeleton label="Loading Brain files" variant="files" />
        ) : filesQuery.isError ? (
          <div className="tavern-empty">
            <p>Couldn&apos;t load Brain files.</p>
            <button type="button" onClick={() => void filesQuery.refetch()}>
              Try again
            </button>
          </div>
        ) : files.length === 0 ? (
          <div className="tavern-empty">{emptyText}</div>
        ) : (
          <div className="tavern-tree">
            <FileTree
              dir={buildTree(files)}
              depth={0}
              collapsed={collapsed}
              onToggle={(path) =>
                setCollapsed((prev) => {
                  const next = new Set(prev);
                  if (next.has(path)) next.delete(path);
                  else next.add(path);
                  return next;
                })
              }
              onOpen={openFile}
            />
          </div>
        )}
        <button
          type="button"
          className="tavern-file-new"
          onClick={() => setView({ kind: "create", name: "", draft: "" })}
        >
          + {newLabel}
        </button>
      </section>
    </>
  );
}
