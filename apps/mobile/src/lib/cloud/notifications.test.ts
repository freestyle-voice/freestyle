import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  json,
  requestPermissionsAsync,
  getExpoPushTokenAsync,
  setNotificationChannelAsync,
} = vi.hoisted(() => ({
  json: vi.fn(),
  requestPermissionsAsync: vi.fn(),
  getExpoPushTokenAsync: vi.fn(),
  setNotificationChannelAsync: vi.fn(),
}));
vi.mock("./client", () => ({ cloud: { json } }));
vi.mock("expo-notifications", () => ({
  requestPermissionsAsync,
  getExpoPushTokenAsync,
  setNotificationChannelAsync,
  AndroidImportance: { DEFAULT: 3 },
}));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { extra: { eas: { projectId: "project-1" } } } },
}));
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));

import {
  dismissNotification,
  listNotificationHistory,
  listNotifications,
  openNotification,
  registerExpoPush,
} from "./notifications";

describe("mobile Cloud notifications", () => {
  beforeEach(() => {
    json.mockReset();
    requestPermissionsAsync.mockReset();
    getExpoPushTokenAsync.mockReset();
    setNotificationChannelAsync.mockReset();
  });
  it("reads active and historical notifications from Cloud", async () => {
    json
      .mockResolvedValueOnce({ notifications: [{ id: "notice-1" }] })
      .mockResolvedValueOnce({
        notifications: [{ id: "notice-1", dismissedAt: 1 }],
      });
    await expect(listNotifications()).resolves.toEqual([{ id: "notice-1" }]);
    await expect(listNotificationHistory()).resolves.toEqual([
      { id: "notice-1", dismissedAt: 1 },
    ]);
  });
  it("maps open and clear to the Cloud lifecycle", async () => {
    await openNotification("notice-1");
    await dismissNotification("notice-1");
    expect(json).toHaveBeenNthCalledWith(1, "/v2/notifications/notice-1/open", {
      method: "POST",
    });
    expect(json).toHaveBeenNthCalledWith(
      2,
      "/v2/notifications/notice-1/dismiss",
      { method: "POST" },
    );
  });
  it("registers an Expo token with Cloud after permission is granted", async () => {
    requestPermissionsAsync.mockResolvedValueOnce({ granted: true });
    getExpoPushTokenAsync.mockResolvedValueOnce({
      data: "ExponentPushToken[x]",
    });
    await expect(registerExpoPush()).resolves.toBe("granted");
    expect(setNotificationChannelAsync).toHaveBeenCalledWith("remix-updates", {
      name: "Remix updates",
      importance: 3,
    });
    expect(json).toHaveBeenCalledWith("/v2/notifications/push-token", {
      method: "POST",
      json: { token: "ExponentPushToken[x]" },
    });
  });
});
