import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
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
  return (
    await cloud.json<{ notifications: AgentNotification[] }>(
      "/v2/notifications",
    )
  ).notifications;
}
export async function listNotificationHistory(): Promise<
  AgentNotificationHistory[]
> {
  return (
    await cloud.json<{ notifications: AgentNotificationHistory[] }>(
      "/v2/notifications/history",
    )
  ).notifications;
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
/** Request Expo permissions during onboarding and register this delivery address with Cloud. */
export async function registerExpoPush(): Promise<
  "granted" | "denied" | "unavailable"
> {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("remix-updates", {
      name: "Remix updates",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) return "denied";
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) return "unavailable";
  const expoToken = await Notifications.getExpoPushTokenAsync({ projectId });
  await cloud.json("/v2/notifications/push-token", {
    method: "POST",
    json: { token: expoToken.data },
  });
  return "granted";
}
