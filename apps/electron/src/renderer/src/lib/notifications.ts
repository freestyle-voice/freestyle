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
