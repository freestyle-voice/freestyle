import { apiFetch } from "@renderer/lib/api";

export type NotificationHistoryRow = {
  id: string;
  kind: "thread" | "info";
  title: string;
  body: string;
  payload: { threadId?: string; url?: string } | null;
  createdAt: number;
  expiresAt: number | null;
  dismissedAt: number | null;
  openedAt: number | null;
};

export class NotificationHistoryError extends Error {
  constructor(readonly kind: "signed-out" | "unreachable") {
    super(kind);
  }
}

export async function listNotificationHistory(): Promise<
  NotificationHistoryRow[]
> {
  let response: Response;
  try {
    response = await apiFetch("/api/notifications/history");
  } catch {
    throw new NotificationHistoryError("unreachable");
  }
  if (response.status === 401) throw new NotificationHistoryError("signed-out");
  if (!response.ok) throw new NotificationHistoryError("unreachable");
  try {
    const data = (await response.json()) as {
      notifications?: NotificationHistoryRow[];
    };
    return data.notifications ?? [];
  } catch {
    throw new NotificationHistoryError("unreachable");
  }
}

export type QuietHours = { start: number; end: number } | null;

export const DEFAULT_QUIET_HOURS: QuietHours = { start: 21, end: 7 };

export async function getQuietHours(): Promise<QuietHours> {
  try {
    const response = await apiFetch("/api/notifications/preferences");
    if (!response.ok) return DEFAULT_QUIET_HOURS;
    const data = (await response.json()) as { quietHours?: QuietHours };
    return data.quietHours === undefined
      ? DEFAULT_QUIET_HOURS
      : data.quietHours;
  } catch {
    return DEFAULT_QUIET_HOURS;
  }
}

export async function setQuietHours(quietHours: QuietHours): Promise<void> {
  const res = await apiFetch("/api/notifications/preferences", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quietHours }),
  });
  if (!res.ok) throw new Error("Could not save quiet hours.");
}
