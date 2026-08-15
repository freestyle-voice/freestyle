import { DataSkeleton } from "@renderer/components/data-skeleton";
import {
  DEFAULT_QUIET_HOURS,
  NotificationHistoryError,
  type NotificationHistoryRow,
  type QuietHours,
  setQuietHours,
} from "@renderer/lib/notifications";
import {
  notificationHistoryQueryOptions,
  queryKeys,
  quietHoursQueryOptions,
} from "@renderer/lib/query";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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

function statusOf(row: NotificationHistoryRow): {
  label: string;
  tone: string;
} {
  if (row.openedAt) return { label: "Opened", tone: "is-opened" };
  if (row.dismissedAt) return { label: "Dismissed", tone: "is-dismissed" };
  if (row.expiresAt !== null && row.expiresAt <= Date.now())
    return { label: "Expired", tone: "is-expired" };
  return { label: "Unread", tone: "is-unread" };
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, hour) => ({
  value: String(hour),
  label: `${String(hour).padStart(2, "0")}:00`,
}));

export function QuietHoursSettings(): React.JSX.Element | null {
  const queryClient = useQueryClient();
  const quietQuery = useQuery(quietHoursQueryOptions());
  const quiet = quietQuery.data;

  if (quiet === undefined) return null;

  const save = (next: QuietHours): void => {
    queryClient.setQueryData(queryKeys.notifications.quietHours, next);
    void setQuietHours(next).catch(() => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.notifications.quietHours,
      });
    });
  };

  return (
    <>
      <div className="tavern-set-row is-static">
        <span className="tavern-set-label">Quiet hours</span>
        <button
          type="button"
          role="switch"
          aria-checked={quiet !== null}
          className={`tavern-set-switch${quiet !== null ? " is-on" : ""}`}
          onClick={() => save(quiet === null ? DEFAULT_QUIET_HOURS : null)}
        >
          <span className="tavern-set-knob" />
        </button>
      </div>
      {quiet !== null ? (
        <>
          <div className="tavern-set-row is-static">
            <span className="tavern-set-label">From</span>
            <select
              className="tavern-set-select"
              value={String(quiet.start)}
              aria-label="Quiet hours start"
              onChange={(e) =>
                save({ ...quiet, start: Number(e.target.value) })
              }
            >
              {HOUR_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="tavern-set-row is-static">
            <span className="tavern-set-label">Until</span>
            <select
              className="tavern-set-select"
              value={String(quiet.end)}
              aria-label="Quiet hours end"
              onChange={(e) => save({ ...quiet, end: Number(e.target.value) })}
            >
              {HOUR_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </>
      ) : null}
      <p className="tavern-set-hint">
        {quiet === null
          ? "Freestyle can reach you at any hour."
          : "Scheduled tasks still run and still write to your history — they just won't interrupt you in this window."}
      </p>
    </>
  );
}

export function NotificationsHistory(): React.JSX.Element {
  const query = useQuery(notificationHistoryQueryOptions());
  const error =
    query.error instanceof NotificationHistoryError ? query.error : null;

  if (query.isLoading) return <DataSkeleton label="Loading notifications" />;
  if (error?.kind === "signed-out")
    return (
      <div className="tavern-empty">Sign in to see your notifications.</div>
    );
  if (error?.kind === "unreachable")
    return (
      <div className="tavern-empty">
        Couldn't reach Freestyle Cloud. Try again in a moment.
      </div>
    );
  const rows = query.data ?? [];
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
        return (
          <div key={row.id} className="tavern-notif">
            <div className="tavern-notif-head">
              <span className="tavern-notif-title">{row.title}</span>
              <span className={`tavern-notif-chip ${status.tone}`}>
                {status.label}
              </span>
            </div>
            <p className="tavern-notif-body">{row.body}</p>
            <span className="tavern-notif-meta">
              {when(row.createdAt)}
              {row.kind === "thread" ? " · conversation" : ""}
            </span>
          </div>
        );
      })}
    </>
  );
}
