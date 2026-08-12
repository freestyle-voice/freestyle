import { apiFetch } from "@renderer/lib/api";
import type React from "react";
import { useEffect, useState } from "react";

interface NotificationHistoryRow {
  id: string;
  kind: "thread" | "info";
  title: string;
  body: string;
  createdAt: number;
  expiresAt: number | null;
  dismissedAt: number | null;
  openedAt: number | null;
}

type Load = "loading" | "ready" | "signed-out" | "unreachable";

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

export function NotificationsHistory(): React.JSX.Element {
  const [rows, setRows] = useState<NotificationHistoryRow[]>([]);
  const [load, setLoad] = useState<Load>("loading");

  useEffect(() => {
    let cancelled = false;
    void apiFetch("/api/notifications/history")
      .then(async (res) => {
        if (res.status === 401) return "signed-out" as const;
        if (!res.ok) return "unreachable" as const;
        const data = (await res.json()) as {
          notifications?: NotificationHistoryRow[];
        };
        return data.notifications ?? [];
      })
      .catch(() => "unreachable" as const)
      .then((result) => {
        if (cancelled) return;
        if (result === "signed-out" || result === "unreachable") {
          setLoad(result);
          return;
        }
        setRows(result);
        setLoad("ready");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (load === "loading")
    return <div className="tavern-empty">Loading notifications…</div>;
  if (load === "signed-out")
    return (
      <div className="tavern-empty">Sign in to see your notifications.</div>
    );
  if (load === "unreachable")
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
