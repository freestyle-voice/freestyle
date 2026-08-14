import { BrainGraph } from "@renderer/components/brain-graph";
import { Markdown } from "@renderer/components/markdown";
import { fsCall, type BrainFile as HomeFile } from "@renderer/lib/brain-fs";
import type React from "react";
import { Fragment, useCallback, useEffect, useState } from "react";

type FileView =
  | { kind: "list" }
  | { kind: "graph" }
  | { kind: "view"; path: string; text: string }
  | { kind: "edit"; path: string; draft: string }
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
  onDraft,
  onSave,
  onCancel,
}: {
  label: string;
  draft: string;
  onDraft: (text: string) => void;
  onSave: () => void;
  onCancel: () => void;
}): React.JSX.Element {
  return (
    <>
      <span className="tavern-file-back">{label}</span>
      <textarea
        className="tavern-editor"
        value={draft}
        onChange={(e) => onDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            onCancel();
          }
        }}
      />
      <div className="tavern-approve-actions">
        <button
          type="button"
          className="tavern-approve-btn tavern-approve-allow"
          onClick={onSave}
        >
          Save
        </button>
        <button type="button" className="tavern-approve-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </>
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
  graphable = false,
}: {
  root: string;
  emptyText: string;
  newLabel: string;
  graphable?: boolean;
}): React.JSX.Element {
  const [files, setFiles] = useState<HomeFile[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  // List first even when the graph is available — the graph stays a toggle away.
  const [view, setView] = useState<FileView>({ kind: "list" });

  const load = useCallback((): void => {
    void fsCall("list", root ? { path: root } : {}).then((res) => {
      if (res?.ok) setFiles((res.files as HomeFile[]) ?? []);
    });
  }, [root]);

  useEffect(() => {
    load();
  }, [load]);

  const openFile = (path: string): void => {
    void fsCall("read", { path }).then((res) => {
      if (res?.ok)
        setView({ kind: "view", path, text: (res.text as string) ?? "" });
    });
  };

  const saveFile = (path: string, text: string): void => {
    void fsCall("write", { path, text }).then((res) => {
      if (res?.ok) {
        load();
        setView({ kind: "view", path, text });
      }
    });
  };

  if (view.kind === "graph") {
    return (
      <>
        <div className="tavern-note-bar">
          <button
            type="button"
            className="tavern-file-back"
            onClick={() => setView({ kind: "list" })}
          >
            ☰ List
          </button>
          <span className="tavern-head-spacer" />
          <span className="tavern-graph-hint">
            drag to orbit · click to focus · double-click to open
          </span>
        </div>
        <BrainGraph onOpen={openFile} />
      </>
    );
  }

  if (view.kind === "view") {
    return (
      <>
        <button
          type="button"
          className="tavern-file-back"
          onClick={() => setView({ kind: "list" })}
        >
          ← {view.path.replace(/\\/g, "/")}
        </button>
        <Markdown text={view.text} />
        <div className="tavern-approve-actions">
          <button
            type="button"
            className="tavern-approve-btn"
            onClick={() =>
              setView({ kind: "edit", path: view.path, draft: view.text })
            }
          >
            Edit
          </button>
          <button
            type="button"
            className="tavern-file-delete"
            onClick={() => {
              void fsCall("delete", { path: view.path }).then(() => {
                setView({ kind: "list" });
                load();
              });
            }}
          >
            Delete
          </button>
        </div>
      </>
    );
  }

  if (view.kind === "edit") {
    return (
      <FileEditor
        label={view.path.replace(/\\/g, "/")}
        draft={view.draft}
        onDraft={(draft) => setView({ ...view, draft })}
        onSave={() => saveFile(view.path, view.draft)}
        onCancel={() => openFile(view.path)}
      />
    );
  }

  if (view.kind === "create") {
    return (
      <>
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
          onDraft={(draft) => setView({ ...view, draft })}
          onSave={() =>
            saveFile(
              `${root ? `${root}/` : ""}${slugify(view.name)}.md`,
              view.draft,
            )
          }
          onCancel={() => setView({ kind: "list" })}
        />
      </>
    );
  }

  return (
    <>
      {graphable ? (
        <button
          type="button"
          className="tavern-file-back"
          onClick={() => setView({ kind: "graph" })}
        >
          ◉ Graph
        </button>
      ) : null}
      {files.length === 0 ? (
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
        ＋ {newLabel}
      </button>
    </>
  );
}
