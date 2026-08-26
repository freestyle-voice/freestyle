import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  json,
  requestPermissionsAsync,
  getExpoPushTokenAsync,
  setNotificationChannelAsync,
  signIn,
  setTokenForProvider,
  signOut,
} = vi.hoisted(() => ({
  json: vi.fn(),
  requestPermissionsAsync: vi.fn(),
  getExpoPushTokenAsync: vi.fn(),
  setNotificationChannelAsync: vi.fn(),
  signIn: vi.fn(),
  setTokenForProvider: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("@/lib/cloud/client", () => ({ cloud: { json } }));
vi.mock("@trycourier/courier-react-native", () => ({
  default: { shared: { signIn, setTokenForProvider, signOut } },
  CourierPushProvider: { EXPO: "expo" },
}));
vi.mock("expo", () => ({ isRunningInExpoGo: () => false }));
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

import { registerCourierExpoPush } from "./notifications";

describe("mobile Courier notifications", () => {
  beforeEach(() => {
    json.mockReset();
    requestPermissionsAsync.mockReset();
    getExpoPushTokenAsync.mockReset();
    setNotificationChannelAsync.mockReset();
    signIn.mockReset();
    setTokenForProvider.mockReset();
    signOut.mockReset();
  });
  it("registers Expo delivery with Courier using a scoped Cloud token", async () => {
    requestPermissionsAsync.mockResolvedValueOnce({ granted: true });
    getExpoPushTokenAsync.mockResolvedValueOnce({
      data: "ExponentPushToken[x]",
    });
    json.mockResolvedValueOnce({ token: "courier-client-token" });
    await expect(registerCourierExpoPush("user-1")).resolves.toBe("granted");
    expect(setNotificationChannelAsync).toHaveBeenCalledWith("remix-updates", {
      name: "Remix updates",
      importance: 3,
    });
    expect(json).toHaveBeenCalledWith("/v2/notifications/token", {
      method: "POST",
    });
    expect(signIn).toHaveBeenCalledWith({
      accessToken: "courier-client-token",
      userId: "user-1",
    });
    expect(setTokenForProvider).toHaveBeenCalledWith({
      provider: "expo",
      token: "ExponentPushToken[x]",
    });
  });
});
