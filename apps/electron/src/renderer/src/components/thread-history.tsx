import { capture } from "@renderer/lib/analytics";
import {
  threadHistoryInfiniteQueryOptions,
  threadQueryOptions,
} from "@renderer/lib/query";
import {
  THREAD_ORIGIN_LABELS,
  THREAD_ORIGINS,
  type ThreadOrigin,
  type ThreadState,
} from "@renderer/lib/threads";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import type React from "react";
import { Fragment, useState } from "react";

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
  initialOrigin = "user",
}: {
  onPick: (thread: ThreadState) => void;
  currentId: string;
  /** Lets the Activity drawer start on scheduled briefs without a tab hop. */
  initialOrigin?: ThreadOrigin;
}): React.JSX.Element {
  const queryClient = useQueryClient();
  const [origin, setOrigin] = useState<ThreadOrigin>(initialOrigin);
  const historyQuery = useInfiniteQuery(
    threadHistoryInfiniteQueryOptions(origin),
  );
  const threads =
    historyQuery.data?.pages.flatMap((page) => page.threads) ?? [];

  const filter = (
    <div className="tavern-thread-filter" role="tablist">
      {THREAD_ORIGINS.map((id) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={origin === id}
          className="tavern-thread-filter-tab"
          onClick={() => setOrigin(id)}
        >
          {THREAD_ORIGIN_LABELS[id]}
        </button>
      ))}
    </div>
  );

  if (historyQuery.isLoading)
    return (
      <>
        {filter}
        <div className="tavern-empty tavern-thread-empty">
          {origin === "user" ? "Loading conversations…" : "Loading activity…"}
        </div>
      </>
    );
  if (threads.length === 0)
    return (
      <>
        {filter}
        <div className="tavern-empty tavern-thread-empty">
          <strong>
            {origin === "user" ? "No conversations yet" : "No briefs yet"}
          </strong>
          <span>
            {origin === "user"
              ? "Start a chat and it will be saved here."
              : "Scheduled tasks will add their updates here."}
          </span>
        </div>
      </>
    );

  let lastGroup = "";
  return (
    <>
      {filter}
      {threads.map((t) => {
        const group = dateGroup(t.updatedAt);
        const divider = group !== lastGroup;
        lastGroup = group;
        return (
          <Fragment key={t.id}>
            {divider ? <p className="tavern-thread-divider">{group}</p> : null}
            <button
              type="button"
              className={`tavern-thread-row${t.id === currentId ? " is-current" : ""}`}
              onClick={() => {
                capture("thread_opened", { origin });
                void queryClient
                  .fetchQuery(threadQueryOptions(t.id))
                  .then((picked) => picked && onPick(picked));
              }}
            >
              {t.title}
            </button>
          </Fragment>
        );
      })}
      {historyQuery.hasNextPage ? (
        <button
          type="button"
          className="tavern-thread-row"
          disabled={historyQuery.isFetchingNextPage}
          onClick={() => void historyQuery.fetchNextPage()}
        >
          {historyQuery.isFetchingNextPage
            ? "Loading conversations…"
            : "Load more conversations"}
        </button>
      ) : null}
    </>
  );
}
