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

/**
 * A light home view for durable work. It deliberately summarizes server-owned
 * state rather than reproducing a second agent chat or exposing tool payloads.
 */
export function AttentionHome({
  onOpenThread,
  onOpenSettings,
}: {
  onOpenThread?: (threadId: string, title: string, updatedAt: string) => void;
  onOpenSettings?: () => void;
}): React.JSX.Element | null {
  const auth = useCloudAuth();
  const query = useQuery({
    ...attentionQueryOptions(),
    enabled: auth.canRequestData,
  });

  if (auth.loading || !auth.user) return null;

  // This is an optional summary above the new-chat welcome. Let it load in
  // the background instead of inserting unrelated rows into an otherwise
  // ready composer; render it only once there is work to surface.
  if (query.isPending) return null;

  const allItems = query.data?.items ?? [];
  if (allItems.length === 0) return null;
  const items = allItems.slice(0, 5);

  return (
    <section className="tavern-attention-home" aria-label="What needs me now">
      <div className="tavern-attention-home-head">
        <div>
          <span className="tavern-attention-eyebrow">What needs me now</span>
          <p>Work Remix is keeping an eye on.</p>
        </div>
        <span className="tavern-attention-count">{allItems.length}</span>
      </div>
      <div className="tavern-attention-list">
        {items.map((item) => {
          const target = threadTarget(item.target);
          const opensSettings =
            item.target.type === "connection" && onOpenSettings;
          const clickable = Boolean((target && onOpenThread) || opensSettings);
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
                if (target && onOpenThread) {
                  onOpenThread(target, item.title, item.updatedAt);
                } else {
                  onOpenSettings?.();
                }
              }}
            >
              {content}
            </button>
          ) : (
            <div key={item.id} className="tavern-attention-item is-static">
              {content}
            </div>
          );
        })}
      </div>
    </section>
  );
}
