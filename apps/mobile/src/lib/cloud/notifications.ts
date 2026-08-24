import { cloud } from "./client";

export type AgentNotification = {
  id: string;
  kind: "thread" | "info";
  title: string;
  body: string;
  payload: { threadId?: string; url?: string } | null;
  createdAt: number;
  expiresAt: number | null;
};

export type AgentNotificationHistory = AgentNotification & {
  dismissedAt: number | null;
  openedAt: number | null;
};

export async function listNotifications(): Promise<AgentNotification[]> {
  const result = await cloud.json<{ notifications: AgentNotification[] }>(
    "/v2/notifications",
  );
  return result.notifications;
}

export async function listNotificationHistory(): Promise<
  AgentNotificationHistory[]
> {
  const result = await cloud.json<{
    notifications: AgentNotificationHistory[];
  }>("/v2/notifications/history");
  return result.notifications;
}

export async function openNotification(id: string): Promise<void> {
  await cloud.json(`/v2/notifications/${encodeURIComponent(id)}/open`, {
    method: "POST",
  });
}

export async function dismissNotification(id: string): Promise<void> {
  await cloud.json(`/v2/notifications/${encodeURIComponent(id)}/dismiss`, {
    method: "POST",
  });
}
