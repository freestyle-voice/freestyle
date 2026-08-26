import type { InboxMessage } from "@trycourier/courier-react";

export interface CourierNotificationItem {
  id: string;
  notificationId: string | null;
  title: string;
  body: string;
  threadId: string | null;
  createdAt: number;
  readAt: number | null;
  openedAt: number | null;
  archivedAt: number | null;
  message: InboxMessage;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function timestamp(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function notificationThreadId(message: InboxMessage): string | null {
  return optionalString(message.data?.threadId);
}

export function courierNotificationItem(
  message: InboxMessage,
): CourierNotificationItem {
  return {
    id: message.messageId,
    notificationId: optionalString(message.data?.notificationId),
    title: optionalString(message.title) ?? "Freestyle update",
    body: optionalString(message.body) ?? optionalString(message.preview) ?? "",
    threadId: notificationThreadId(message),
    createdAt: timestamp(message.created) ?? Date.now(),
    readAt: timestamp(message.read),
    openedAt: timestamp(message.opened),
    archivedAt: timestamp(message.archived),
    message,
  };
}

export function activeCourierNotifications(
  messages: InboxMessage[],
): CourierNotificationItem[] {
  return messages
    .filter((message) => !message.opened && !message.archived)
    .map(courierNotificationItem)
    .sort((a, b) => b.createdAt - a.createdAt);
}

interface CourierOpenLifecycle {
  openMessage: (message: InboxMessage) => void;
  clickMessage: (message: InboxMessage) => Promise<void>;
}

export async function openCourierNotification(
  item: CourierNotificationItem,
  lifecycle: CourierOpenLifecycle,
  routeThread?: (threadId: string) => void,
): Promise<void> {
  lifecycle.openMessage(item.message);
  await lifecycle.clickMessage(item.message).catch(() => {});
  if (item.threadId) routeThread?.(item.threadId);
}

export function archiveCourierNotification(
  item: CourierNotificationItem,
  lifecycle: {
    archiveMessage: (message: InboxMessage) => Promise<void>;
  },
): Promise<void> {
  return lifecycle.archiveMessage(item.message);
}
