import { DataSkeleton } from "@renderer/components/data-skeleton";
import type { CourierNotificationItem } from "@renderer/lib/courier-notifications";
import {
  CourierNotificationsProvider,
  useCourierNotifications,
} from "@renderer/lib/courier-provider";
import type React from "react";

function when(ts: number): string {
  const date = new Date(ts);
  const diffMin = Math.round((Date.now() - ts) / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffMin < 60 * 24) return `${Math.round(diffMin / 60)}h ago`;
  const opts: Intl.DateTimeFormatOptions =
    date.getFullYear() === new Date().getFullYear()
      ? { month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" };
  return date.toLocaleDateString(undefined, opts);
}

function statusOf(row: CourierNotificationItem): {
  label: string;
  tone: string;
} {
  if (row.archivedAt) return { label: "Archived", tone: "is-dismissed" };
  if (row.openedAt) return { label: "Opened", tone: "is-opened" };
  if (row.readAt) return { label: "Read", tone: "is-opened" };
  return { label: "Unread", tone: "is-unread" };
}

function NotificationsHistoryContent({
  onOpenThread,
}: {
  onOpenThread?: (threadId: string) => void;
}): React.JSX.Element {
  const { status, notifications: rows, open } = useCourierNotifications();

  if (status === "loading")
    return <DataSkeleton label="Loading notifications" />;
  if (status === "signed-out")
    return (
      <div className="tavern-empty">Sign in to see your notifications.</div>
    );
  if (status === "unavailable")
    return (
      <div className="tavern-empty">
        Couldn't reach Freestyle Cloud. Try again in a moment.
      </div>
    );
  if (rows.length === 0)
    return (
      <div className="tavern-empty">
        Nothing yet. Scheduled tasks and finished agent runs land here.
      </div>
    );

  return (
    <>
      <p className="tavern-set-hint is-lead">
        Everything Freestyle has sent you, newest first — including the ones
        you've already cleared.
      </p>
      {rows.map((row) => {
        const status = statusOf(row);
        const threadId = onOpenThread ? row.threadId : null;
        const body = (
          <>
            <div className="tavern-notif-head">
              <span className="tavern-notif-title">{row.title}</span>
              <span className={`tavern-notif-chip ${status.tone}`}>
                {status.label}
              </span>
            </div>
            <p className="tavern-notif-body">{row.body}</p>
            <span className="tavern-notif-meta">
              {when(row.createdAt)}
              {threadId ? " · open the conversation" : ""}
            </span>
          </>
        );
        // A dismissed brief used to be unreachable from the one screen meant
        // for finding it again; every row already carries its thread id.
        if (!threadId) {
          return (
            <div key={row.id} className="tavern-notif">
              {body}
            </div>
          );
        }
        return (
          <button
            key={row.id}
            type="button"
            className="tavern-notif is-openable"
            onClick={() => void open(row, onOpenThread)}
          >
            {body}
          </button>
        );
      })}
    </>
  );
}

export function NotificationsHistory({
  onOpenThread,
}: {
  onOpenThread?: (threadId: string) => void;
}): React.JSX.Element {
  return (
    <CourierNotificationsProvider>
      <NotificationsHistoryContent
        {...(onOpenThread ? { onOpenThread } : {})}
      />
    </CourierNotificationsProvider>
  );
}
