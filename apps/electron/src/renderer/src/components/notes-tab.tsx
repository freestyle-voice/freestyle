import { DataSkeleton } from "@renderer/components/data-skeleton";
import { Markdown } from "@renderer/components/markdown";
import {
  deleteBrainFile,
  uniqueBrainPath,
  writeBrainFile,
} from "@renderer/lib/brain-fs";
import type { NoteSummary } from "@renderer/lib/brain-views";
import {
  brainFileQueryOptions,
  notesQueryOptions,
  queryKeys,
} from "@renderer/lib/query";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";

const AUTOSAVE_MS = 800;

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
  | { kind: "loading"; path: string }
  | { kind: "note"; path: string | null; draft: string; editing: boolean };

export function NotesTab(): React.JSX.Element {
  const queryClient = useQueryClient();
  const notesQuery = useQuery(notesQueryOptions());
  const notes: NoteSummary[] = notesQuery.data ?? [];
  const [view, setView] = useState<NoteView>({ kind: "list" });
  const [error, setError] = useState<string | null>(null);
  const saveTimer = useRef<NodeJS.Timeout | null>(null);
  const viewRef = useRef(view);
  viewRef.current = view;

  const persist = useCallback(async (): Promise<void> => {
    try {
      const current = viewRef.current;
      if (current.kind !== "note") return;
      const text = current.draft;
      if (!text.trim()) return;
      let path = current.path;
      if (!path) {
        const slug = slugForTitle(noteLines(text).title);
        path = await uniqueBrainPath(`notes/${slug}.md`);
        const chosen = path;
        setView((v) => (v.kind === "note" ? { ...v, path: chosen } : v));
      }
      const ok = await writeBrainFile(path, text);
      if (!ok) {
        setError("Couldn't save that note. Try again.");
        return;
      }
      queryClient.setQueryData(queryKeys.brain.file(path), text);
      await queryClient.invalidateQueries({ queryKey: queryKeys.brain.all });
    } catch {
      setError("Couldn't save that note. Try again.");
    }
  }, [queryClient]);

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
    void persist();
    setView({ kind: "list" });
  };

  const notice = error ? (
    <p className="tavern-notice" role="alert">
      {error}
    </p>
  ) : null;

  if (view.kind === "loading") {
    return (
      <>
        <div className="tavern-note-bar">
          <button
            type="button"
            className="tavern-file-back"
            onClick={() => setView({ kind: "list" })}
          >
            ← Notes
          </button>
        </div>
        <DataSkeleton label="Loading note" rows={3} variant="notes" />
      </>
    );
  }

  if (view.kind === "note") {
    return (
      <>
        {notice}
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
                void deleteBrainFile(target)
                  .then((ok) => {
                    if (!ok) {
                      setError("Couldn't delete that note. Try again.");
                      return;
                    }
                    void queryClient.invalidateQueries({
                      queryKey: queryKeys.brain.all,
                    });
                  })
                  .catch(() => {
                    setError("Couldn't delete that note. Try again.");
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

  if (notesQuery.isLoading)
    return <DataSkeleton label="Loading notes" variant="notes" />;
  if (notesQuery.isError)
    return (
      <div className="tavern-empty">
        <p>Couldn&apos;t load notes.</p>
        <button type="button" onClick={() => void notesQuery.refetch()}>
          Try again
        </button>
      </div>
    );

  return (
    <>
      {notice}
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
            setError(null);
            setView({ kind: "loading", path: n.path });
            void queryClient
              .fetchQuery(brainFileQueryOptions(n.path))
              .then((text) => {
                setView({
                  kind: "note",
                  path: n.path,
                  draft: text ?? "",
                  editing: false,
                });
              })
              .catch(() => {
                setError("Couldn't open that note. Try again.");
                setView({ kind: "list" });
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
        onClick={() => {
          setError(null);
          setView({ kind: "note", path: null, draft: "", editing: true });
        }}
      >
        ＋ New note
      </button>
    </>
  );
}
