import type { AttentionItem, AttentionTarget } from "@renderer/lib/attention";
import { useCloudAuth } from "@renderer/lib/auth-context";
import { attentionQueryOptions } from "@renderer/lib/query";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  Bot,
  CalendarClock,
  ChevronRight,
  PlugZap,
} from "lucide-react";
import type React from "react";

function itemIcon(item: AttentionItem): React.JSX.Element {
  const Icon =
    item.kind === "approval"
      ? AlertCircle
      : item.kind === "scheduled_run"
        ? CalendarClock
        : item.kind === "connection"
          ? PlugZap
          : Bot;
  return <Icon aria-hidden="true" />;
}

function threadTarget(target: AttentionTarget): string | null {
  if (target.type === "thread") return target.threadId;
  if (target.type === "scheduled") return target.threadId ?? null;
  return null;
}

export function AttentionHome({
  onOpenThread,
  onOpenSettings,
  onOpenScheduled,
}: {
  onOpenThread?: (threadId: string, title: string, updatedAt: string) => void;
  onOpenSettings?: (connectionId: string) => void;
  onOpenScheduled?: (taskId: string) => void;
}): React.JSX.Element | null {
  const auth = useCloudAuth();
  const query = useQuery({
    ...attentionQueryOptions(),
    enabled: auth.canRequestData,
  });

  if (auth.loading || !auth.user || query.isPending) return null;

  const allItems = query.data?.items ?? [];
  if (allItems.length === 0 && !query.isError) return null;

  const renderItem = (item: AttentionItem): React.JSX.Element => {
    const target = threadTarget(item.target);
    const connectionId =
      item.target.type === "connection" ? item.target.connectionId : null;
    const taskId = item.target.type === "scheduled" ? item.target.taskId : null;
    const clickable = Boolean(
      (target && onOpenThread) ||
        (connectionId && onOpenSettings) ||
        (taskId && onOpenScheduled),
    );
    const content = (
      <>
        <span className={`tavern-attention-icon is-${item.status}`}>
          {itemIcon(item)}
        </span>
        <span className="tavern-attention-copy">
          <strong>{item.title}</strong>
          {item.detail ? <small>{item.detail}</small> : null}
        </span>
        {clickable ? <ChevronRight aria-hidden="true" /> : null}
      </>
    );
    return clickable ? (
      <button
        key={item.id}
        type="button"
        className="tavern-attention-item"
        onClick={() => {
          if (target && onOpenThread)
            onOpenThread(target, item.title, item.updatedAt);
          else if (connectionId) onOpenSettings?.(connectionId);
          else if (taskId) onOpenScheduled?.(taskId);
        }}
      >
        {content}
      </button>
    ) : (
      <div key={item.id} className="tavern-attention-item is-static">
        {content}
      </div>
    );
  };

  const remaining = allItems.length - 5;
  return (
    <section className="tavern-attention-home" aria-label="Needs attention">
      <div className="tavern-attention-home-head">
        <div>
          <span className="tavern-attention-eyebrow">Needs attention</span>
          <p>Approvals, active work, and issues to resolve.</p>
        </div>
        {allItems.length > 0 ? (
          <span className="tavern-attention-count">{allItems.length}</span>
        ) : null}
      </div>
      {query.isError ? (
        <div className="tavern-attention-error" role="alert">
          <span>
            Couldn&apos;t refresh work that needs attention.
            {allItems.length > 0 ? " Showing the last update." : ""}
          </span>
          <button
            type="button"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            {query.isFetching ? "Refreshing…" : "Try again"}
          </button>
        </div>
      ) : null}
      {allItems.length > 0 ? (
        <div className="tavern-attention-list">
          {allItems.slice(0, 5).map(renderItem)}
        </div>
      ) : null}
      {remaining > 0 ? (
        <details className="tavern-attention-more">
          <summary>
            View {remaining} more {remaining === 1 ? "item" : "items"}
          </summary>
          <div className="tavern-attention-list">
            {allItems.slice(5).map(renderItem)}
          </div>
        </details>
      ) : null}
    </section>
  );
}
