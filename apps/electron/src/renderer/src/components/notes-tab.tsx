import { Markdown } from "@renderer/components/markdown";
import {
  deleteBrainFile,
  listBrainFiles,
  peekBrainFile,
  peekBrainFiles,
  readBrainFile,
  writeBrainFile,
} from "@renderer/lib/brain-fs";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

const AUTOSAVE_MS = 800;

interface NoteSummary {
  path: string;
  title: string;
  snippet: string;
  modified: number;
}

function noteLines(text: string): { title: string; snippet: string } {
  const lines = text
    .split("\n")
    .map((l) => l.replace(/^#+\s*/, "").trim())
    .filter(Boolean);
  return {
    title: lines[0] ?? "New note",
    snippet: lines[1] ?? "",
  };
}

/** Build note summaries from cache only — null if any piece is missing. */
function summariesFromCache(): NoteSummary[] | null {
  const files = peekBrainFiles("notes");
  if (files === undefined) return null;
  const summaries: NoteSummary[] = [];
  for (const f of files) {
    const path = f.path.replace(/\\/g, "/");
    const text = peekBrainFile(path);
    if (text === undefined) return null;
    summaries.push({ path, ...noteLines(text), modified: f.modified });
  }
  summaries.sort((a, b) => b.modified - a.modified);
  return summaries;
}

function slugForTitle(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || `note-${Date.now()}`
  );
}

function noteDate(ts: number): string {
  const date = new Date(ts);
  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();
  if (sameDay)
    return date.toLocaleTimeString(undefined, {
      hour: "numeric",
      minute: "2-digit",
    });
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

type NoteView =
  | { kind: "list" }
  | { kind: "note"; path: string | null; draft: string; editing: boolean };

export function NotesTab(): React.JSX.Element {
  const [notes, setNotes] = useState<NoteSummary[] | null>(() =>
    summariesFromCache(),
  );
  const [view, setView] = useState<NoteView>({ kind: "list" });
  const saveTimer = useRef<NodeJS.Timeout | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  const load = useCallback((): void => {
    void (async () => {
      const files = await listBrainFiles("notes");
      const summaries = await Promise.all(
        files.map(async (f) => {
          const path = f.path.replace(/\\/g, "/");
          const text = (await readBrainFile(path)) ?? "";
          return { path, ...noteLines(text), modified: f.modified };
        }),
      );
      summaries.sort((a, b) => b.modified - a.modified);
      setNotes(summaries);
    })();
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const persist = useCallback(async (): Promise<void> => {
    const current = viewRef.current;
    if (current.kind !== "note") return;
    const text = current.draft;
    if (!text.trim()) return;
    let path = current.path;
    if (!path) {
      const slug = slugForTitle(noteLines(text).title);
      path = `notes/${slug}.md`;
      setView((v) => (v.kind === "note" ? { ...v, path } : v));
    }
    await writeBrainFile(path, text);
  }, []);

  const scheduleSave = useCallback((): void => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      void persist();
    }, AUTOSAVE_MS);
  }, [persist]);

  useEffect(
    () => () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        void persist();
      }
    },
    [persist],
  );

  const closeNote = (): void => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    void persist().then(load);
    setView({ kind: "list" });
  };

  if (view.kind === "note") {
    return (
      <>
        <div className="tavern-note-bar">
          <button
            type="button"
            className="tavern-file-back"
            onClick={closeNote}
          >
            ← Notes
          </button>
          <span className="tavern-head-spacer" />
          {view.path ? (
            <button
              type="button"
              className="tavern-note-delete"
              aria-label="Delete note"
              onClick={() => {
                const target = view.path;
                if (!target) return;
                if (saveTimer.current) {
                  clearTimeout(saveTimer.current);
                  saveTimer.current = null;
                }
                setView({ kind: "list" });
                void deleteBrainFile(target).then((ok) => {
                  if (ok) load();
                });
              }}
            >
              Delete
            </button>
          ) : null}
        </div>
        {view.editing || !view.draft.trim() ? (
          <textarea
            className="tavern-editor tavern-note-editor"
            value={view.draft}
            ref={(el) => el?.focus()}
            placeholder="Start writing — the first line becomes the title."
            onChange={(e) => {
              setView({ ...view, draft: e.target.value, editing: true });
              scheduleSave();
            }}
            onBlur={() => {
              if (view.draft.trim())
                setView((v) =>
                  v.kind === "note" ? { ...v, editing: false } : v,
                );
              void persist();
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.stopPropagation();
                if (saveTimer.current) {
                  clearTimeout(saveTimer.current);
                  saveTimer.current = null;
                }
                void persist();
                setView({ ...view, editing: false });
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="tavern-note-rendered"
            title="Click to edit"
            onClick={() => setView({ ...view, editing: true })}
          >
            <Markdown text={view.draft} />
          </button>
        )}
      </>
    );
  }

  if (notes === null) return <div className="tavern-empty">Loading…</div>;

  return (
    <>
      {notes.length === 0 ? (
        <div className="tavern-empty">
          No notes yet — write one, or ask Freestyle to take one.
        </div>
      ) : null}
      {notes.map((n) => (
        <button
          key={n.path}
          type="button"
          className="tavern-note-row"
          onClick={() => {
            void readBrainFile(n.path).then((text) => {
              setView({
                kind: "note",
                path: n.path,
                draft: text ?? "",
                editing: false,
              });
            });
          }}
        >
          <span className="tavern-note-title">{n.title}</span>
          <span className="tavern-note-meta">
            <span className="tavern-note-date">{noteDate(n.modified)}</span>
            {n.snippet ? (
              <span className="tavern-note-snippet">{n.snippet}</span>
            ) : null}
          </span>
        </button>
      ))}
      <button
        type="button"
        className="tavern-file-new"
        onClick={() =>
          setView({ kind: "note", path: null, draft: "", editing: true })
        }
      >
        ＋ New note
      </button>
    </>
  );
}
