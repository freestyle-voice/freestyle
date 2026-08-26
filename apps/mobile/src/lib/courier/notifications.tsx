import Courier, {
  CourierPushProvider,
  type InboxMessage,
} from "@trycourier/courier-react-native";
import { isRunningInExpoGo } from "expo";
import Constants from "expo-constants";
import * as ExpoNotifications from "expo-notifications";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, Platform } from "react-native";

import { cloud } from "@/lib/cloud/client";

const TOKEN_REFRESH_MS = 45 * 60 * 1000;

export type CourierNotification = {
  id: string;
  title: string;
  body: string;
  data: Record<string, unknown> | null;
  opened: boolean;
  archived: boolean;
};

type NotificationState = {
  active: CourierNotification[];
  archived: CourierNotification[];
  error: string | null;
  loading: boolean;
  refresh: () => Promise<void>;
  open: (messageId: string) => Promise<void>;
  archive: (messageId: string) => Promise<void>;
  openFromPush: (notificationId: string) => Promise<void>;
};

const NotificationContext = createContext<NotificationState | null>(null);

let signedInUserId: string | null = null;
let signedInAt = 0;
let signingIn: Promise<void> | null = null;

function courierIsAvailable(): boolean {
  return Platform.OS !== "web" && !isRunningInExpoGo();
}

function toCourierNotification(message: InboxMessage): CourierNotification {
  return {
    id: message.messageId,
    title: message.title ?? "Remix update",
    body: message.body ?? message.preview ?? "",
    data: message.data ?? null,
    opened: message.isOpened,
    archived: message.isArchived,
  };
}

async function signInToCourier(userId: string): Promise<boolean> {
  if (!courierIsAvailable()) return false;
  if (signedInUserId === userId && Date.now() - signedInAt < TOKEN_REFRESH_MS) {
    return true;
  }
  if (signingIn) {
    await signingIn;
    return signInToCourier(userId);
  }

  signingIn = (async () => {
    const { token } = await cloud.json<{ token: string }>(
      "/v2/notifications/token",
      { method: "POST" },
    );
    if (!token) throw new Error("Cloud did not return a Courier token.");
    await Courier.shared.signIn({ accessToken: token, userId });
    signedInUserId = userId;
    signedInAt = Date.now();
  })();
  try {
    await signingIn;
    return true;
  } finally {
    signingIn = null;
  }
}

async function clearCourierSession(): Promise<void> {
  signedInUserId = null;
  signedInAt = 0;
  if (courierIsAvailable()) await Courier.shared.signOut();
}

/** Request Expo permission during onboarding and register this device with Courier. */
export async function registerCourierExpoPush(
  userId: string,
): Promise<"granted" | "denied" | "unavailable"> {
  if (!courierIsAvailable()) return "unavailable";
  if (Platform.OS === "android") {
    await ExpoNotifications.setNotificationChannelAsync("remix-updates", {
      name: "Remix updates",
      importance: ExpoNotifications.AndroidImportance.DEFAULT,
    });
  }
  const permission = await ExpoNotifications.requestPermissionsAsync();
  if (!permission.granted) return "denied";
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId) return "unavailable";
  if (!(await signInToCourier(userId))) return "unavailable";
  const expoToken = await ExpoNotifications.getExpoPushTokenAsync({
    projectId,
  });
  await Courier.shared.setTokenForProvider({
    provider: CourierPushProvider.EXPO,
    token: expoToken.data,
  });
  return "granted";
}

export function CourierNotificationsProvider({
  children,
  userId,
}: {
  children: ReactNode;
  userId?: string;
}) {
  const [active, setActive] = useState<CourierNotification[]>([]);
  const [archived, setArchived] = useState<CourierNotification[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(userId));
  const activeRef = useRef<CourierNotification[]>([]);
  const archivedRef = useRef<CourierNotification[]>([]);
  const pendingPushNotificationId = useRef<string | null>(null);

  const resolvePendingPush = useCallback(async () => {
    const notificationId = pendingPushNotificationId.current;
    if (!notificationId) return;
    const message = [...activeRef.current, ...archivedRef.current].find(
      (candidate) => candidate.data?.notificationId === notificationId,
    );
    if (!message) return;
    pendingPushNotificationId.current = null;
    await Promise.all([
      Courier.shared.openMessage({ messageId: message.id }),
      Courier.shared.clickMessage({ messageId: message.id }),
    ]);
  }, []);

  const refresh = useCallback(async () => {
    if (!userId || !(await signInToCourier(userId))) return;
    setError(null);
    await Courier.shared.refreshInbox();
    await resolvePendingPush();
  }, [resolvePendingPush, userId]);

  const open = useCallback(async (messageId: string) => {
    await Promise.all([
      Courier.shared.openMessage({ messageId }),
      Courier.shared.clickMessage({ messageId }),
    ]);
    await Courier.shared.refreshInbox();
  }, []);

  const archive = useCallback(async (messageId: string) => {
    await Courier.shared.archiveMessage({ messageId });
    await Courier.shared.refreshInbox();
  }, []);

  const openFromPush = useCallback(
    async (notificationId: string) => {
      pendingPushNotificationId.current = notificationId;
      await resolvePendingPush();
      if (pendingPushNotificationId.current) await refresh();
    },
    [refresh, resolvePendingPush],
  );

  useEffect(() => {
    if (!userId) {
      setActive([]);
      setArchived([]);
      setError(null);
      setLoading(false);
      void clearCourierSession().catch(() => {});
      return;
    }
    if (!courierIsAvailable()) {
      setActive([]);
      setArchived([]);
      setError(null);
      setLoading(false);
      return;
    }

    let disposed = false;
    let listenerId: string | null = null;
    const updateMessages = (
      messages: InboxMessage[],
      feed: "feed" | "archive",
    ) => {
      if (disposed) return;
      const next = messages.map(toCourierNotification);
      if (feed === "feed") {
        activeRef.current = next;
        setActive(next);
      } else {
        archivedRef.current = next;
        setArchived(next);
      }
      void resolvePendingPush().catch((cause: unknown) => {
        if (!disposed) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Couldn't update notification.",
          );
        }
      });
    };

    const start = async () => {
      setLoading(true);
      try {
        if (!(await signInToCourier(userId))) return;
        const listener = await Courier.shared.addInboxListener({
          onError: (message) => {
            if (!disposed) setError(message);
          },
          onMessagesChanged: (messages, _canPaginate, feed) =>
            updateMessages(messages, feed),
        });
        if (disposed) {
          await Courier.shared.removeInboxListener({
            listenerId: listener.listenerId,
          });
          return;
        }
        listenerId = listener.listenerId;
        await Courier.shared.refreshInbox();
      } catch (cause) {
        if (!disposed) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Couldn't load notifications.",
          );
        }
      } finally {
        if (!disposed) setLoading(false);
      }
    };
    void start();

    // Courier client tokens expire after one hour. This is token renewal, not
    // inbox polling; normal updates arrive through Courier's inbox listener.
    const tokenRefresh = setInterval(() => {
      void refresh().catch(() => {});
    }, TOKEN_REFRESH_MS);
    const appState = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") void refresh().catch(() => {});
    });
    return () => {
      disposed = true;
      clearInterval(tokenRefresh);
      appState.remove();
      if (listenerId) void Courier.shared.removeInboxListener({ listenerId });
    };
  }, [refresh, resolvePendingPush, userId]);

  const value = useMemo<NotificationState>(
    () => ({
      active,
      archived,
      error,
      loading,
      refresh,
      open,
      archive,
      openFromPush,
    }),
    [active, archive, archived, error, loading, open, openFromPush, refresh],
  );
  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useCourierNotifications(): NotificationState {
  const context = useContext(NotificationContext);
  if (!context)
    throw new Error(
      "useCourierNotifications must be used within CourierNotificationsProvider.",
    );
  return context;
}
