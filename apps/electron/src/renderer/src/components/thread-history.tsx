import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@renderer/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@renderer/components/ui/dropdown-menu";
import { capture } from "@renderer/lib/analytics";
import { threadHistoryInfiniteQueryOptions } from "@renderer/lib/query";
import type { ThreadOrigin, ThreadSummary } from "@renderer/lib/threads";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Check, Ellipsis, Pencil, Search, Trash2, X } from "lucide-react";
import type React from "react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

function dateGroup(ts: number): string {
  const day = (d: Date): number =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const date = new Date(ts);
  const now = new Date();
  const diffDays = Math.round((day(now) - day(date)) / 86_400_000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  const opts: Intl.DateTimeFormatOptions =
    date.getFullYear() === now.getFullYear()
      ? { month: "long", day: "numeric" }
      : { month: "long", day: "numeric", year: "numeric" };
  return date.toLocaleDateString(undefined, opts);
}

export function ThreadHistory({
  onPick,
  currentId,
  showSearch = false,
  searchQuery,
  titleOverrides,
  onRename,
  onDelete,
  sessionActions,
}: {
  /** Select immediately; the session owner loads the message detail. */
  onPick: (thread: ThreadSummary) => void;
  currentId: string;
  /** The Remix sidebar owns session search; compact panels keep their density. */
  showSearch?: boolean;
  /** Lets the compact Remix titlebar own its search field. */
  searchQuery?: string;
  /** Electron-local title overrides; canonical thread data remains unchanged. */
  titleOverrides?: Record<string, string>;
  /** Sidebar-only actions. Search results intentionally remain selection-only. */
  onRename?: (threadId: string, title: string) => Promise<void>;
  onDelete?: (threadId: string) => Promise<void>;
  /** Keep desktop Remix rows clean while exposing their actions on right-click. */
  sessionActions?: "dropdown" | "context";
}): React.JSX.Element {
  const [internalSearch, setInternalSearch] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const search = searchQuery ?? internalSearch;
  const rendersSearchField = showSearch && searchQuery === undefined;
  const conversationsQuery = useInfiniteQuery(
    threadHistoryInfiniteQueryOptions("user"),
  );
  const briefsQuery = useInfiniteQuery(
    threadHistoryInfiniteQueryOptions("scheduled"),
  );
  const threads = useMemo(() => {
    const withOrigin = (origin: ThreadOrigin, summaries: ThreadSummary[]) =>
      summaries.map((thread) => ({ ...thread, origin }));
    return [
      ...withOrigin(
        "user",
        conversationsQuery.data?.pages.flatMap((page) => page.threads) ?? [],
      ),
      ...withOrigin(
        "scheduled",
        briefsQuery.data?.pages.flatMap((page) => page.threads) ?? [],
      ),
    ].sort((a, b) => b.updatedAt - a.updatedAt);
  }, [briefsQuery.data, conversationsQuery.data]);
  const titledThreads = useMemo(
    () =>
      threads.map((thread) => ({
        ...thread,
        title: titleOverrides?.[thread.id] ?? thread.title,
      })),
    [threads, titleOverrides],
  );
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filteredThreads = normalizedSearch
    ? titledThreads.filter((thread) =>
        thread.title.toLocaleLowerCase().includes(normalizedSearch),
      )
    : titledThreads;
  const isLoading =
    threads.length === 0 &&
    conversationsQuery.isLoading &&
    briefsQuery.isLoading;
  const hasNextPage = conversationsQuery.hasNextPage || briefsQuery.hasNextPage;
  const isFetchingNextPage =
    conversationsQuery.isFetchingNextPage || briefsQuery.isFetchingNextPage;
  const canManage = Boolean(onRename && onDelete);
  const actionPresentation = sessionActions ?? "dropdown";

  useEffect(() => {
    if (renamingId) renameInputRef.current?.focus();
  }, [renamingId]);

  const openThread = (thread: ThreadSummary): void => {
    capture("thread_opened", { origin: thread.origin });
    onPick(thread);
  };

  const commitRename = (thread: ThreadSummary): void => {
    if (!onRename) return;
    const title = renameDraft.trim();
    if (!title) {
      setActionError("A session needs a name.");
      return;
    }
    setActionError(null);
    void onRename(thread.id, title)
      .then(() => setRenamingId(null))
      .catch(() => setActionError("Couldn’t rename that session."));
  };

  const removeThread = (thread: ThreadSummary): void => {
    if (!onDelete) return;
    if (!window.confirm(`Delete “${thread.title}”? This can’t be undone.`))
      return;
    setActionError(null);
    void onDelete(thread.id).catch(() =>
      setActionError("Couldn’t delete that session."),
    );
  };

  const startRename = (thread: ThreadSummary): void => {
    setRenameDraft(thread.title);
    setRenamingId(thread.id);
    setActionError(null);
  };

  if (isLoading)
    return (
      <>
        {rendersSearchField ? (
          <SessionSearch value={search} onChange={setInternalSearch} />
        ) : null}
        <SessionHistorySkeleton />
      </>
    );
  if (filteredThreads.length === 0)
    return (
      <>
        {rendersSearchField ? (
          <SessionSearch value={search} onChange={setInternalSearch} />
        ) : null}
        <div className="tavern-empty tavern-thread-empty">
          <strong>
            {normalizedSearch ? "No matching sessions" : "No sessions yet"}
          </strong>
          <span>
            {normalizedSearch
              ? "Try a different title."
              : "Start a chat or run a scheduled task to see it here."}
          </span>
        </div>
      </>
    );

  let lastGroup = "";
  return (
    <>
      {rendersSearchField ? (
        <SessionSearch value={search} onChange={setInternalSearch} />
      ) : null}
      {filteredThreads.map((t) => {
        const group = dateGroup(t.updatedAt);
        const divider = group !== lastGroup;
        lastGroup = group;
        return (
          <Fragment key={t.id}>
            {divider ? <p className="tavern-thread-divider">{group}</p> : null}
            {canManage && renamingId === t.id ? (
              <form
                className="tavern-thread-rename"
                onSubmit={(event) => {
                  event.preventDefault();
                  commitRename(t);
                }}
              >
                <input
                  value={renameDraft}
                  ref={renameInputRef}
                  aria-label="Session name"
                  onChange={(event) => setRenameDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setRenamingId(null);
                      setActionError(null);
                    }
                  }}
                />
                <button type="submit" aria-label="Save session name">
                  <Check aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label="Cancel rename"
                  onClick={() => {
                    setRenamingId(null);
                    setActionError(null);
                  }}
                >
                  <X aria-hidden="true" />
                </button>
              </form>
            ) : canManage && actionPresentation === "dropdown" ? (
              <div
                className={`tavern-thread-row${t.id === currentId ? " is-current" : ""}`}
              >
                <button
                  type="button"
                  className="tavern-thread-pick"
                  onClick={() => openThread(t)}
                >
                  {t.title}
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="tavern-thread-more"
                      aria-label={`Session actions for ${t.title}`}
                    >
                      <Ellipsis aria-hidden="true" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-35">
                    <DropdownMenuItem onSelect={() => startRename(t)}>
                      <Pencil aria-hidden="true" />
                      Rename
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => removeThread(t)}
                    >
                      <Trash2 aria-hidden="true" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ) : canManage && actionPresentation === "context" ? (
              <ContextMenu>
                <ContextMenuTrigger asChild>
                  <button
                    type="button"
                    className={`tavern-thread-row tavern-thread-row-direct${t.id === currentId ? " is-current" : ""}`}
                    onClick={() => openThread(t)}
                  >
                    {t.title}
                  </button>
                </ContextMenuTrigger>
                <ContextMenuContent className="min-w-35">
                  <ContextMenuItem onSelect={() => startRename(t)}>
                    <Pencil aria-hidden="true" />
                    Rename
                  </ContextMenuItem>
                  <ContextMenuItem
                    variant="destructive"
                    onSelect={() => removeThread(t)}
                  >
                    <Trash2 aria-hidden="true" />
                    Delete
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            ) : (
              <button
                type="button"
                className={`tavern-thread-row tavern-thread-row-direct${t.id === currentId ? " is-current" : ""}`}
                onClick={() => openThread(t)}
              >
                {t.title}
              </button>
            )}
          </Fragment>
        );
      })}
      {actionError ? (
        <p className="tavern-thread-action-error">{actionError}</p>
      ) : null}
      {hasNextPage ? (
        <button
          type="button"
          className="tavern-thread-row"
          disabled={isFetchingNextPage}
          onClick={() => {
            void Promise.all([
              conversationsQuery.hasNextPage
                ? conversationsQuery.fetchNextPage()
                : undefined,
              briefsQuery.hasNextPage ? briefsQuery.fetchNextPage() : undefined,
            ]);
          }}
        >
          {isFetchingNextPage ? "Loading sessions…" : "Load more sessions"}
        </button>
      ) : null}
    </>
  );
}

/**
 * Mirrors the eventual Remix history rather than using the card-style generic
 * skeleton. Keeping the date dividers and single-line row rhythm in place
 * prevents the sidebar from visually jumping when the first page arrives.
 */
function SessionHistorySkeleton(): React.JSX.Element {
  const now = Date.now();
  const groups = [
    { label: dateGroup(now), rows: ["wide", "medium"] },
    { label: dateGroup(now - 86_400_000), rows: ["long"] },
    { label: dateGroup(now - 6 * 86_400_000), rows: ["short", "medium"] },
  ] as const;

  return (
    <div
      className="tavern-session-skeleton"
      aria-busy="true"
      aria-label="Loading sessions"
      role="status"
    >
      {groups.map((group) => (
        <div className="tavern-session-skeleton-group" key={group.label}>
          <p className="tavern-thread-divider">{group.label}</p>
          {group.rows.map((width, index) => (
            <div
              className={`tavern-session-skeleton-row is-${width}${index === 0 && group.label === groups[0].label ? " is-current" : ""}`}
              key={`${group.label}-${width}`}
              aria-hidden="true"
            >
              <span className="tavern-session-skeleton-title" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function SessionSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}): React.JSX.Element {
  return (
    <label className="tavern-thread-search">
      <Search aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search sessions"
        aria-label="Search sessions"
      />
    </label>
  );
}
