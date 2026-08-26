import {
  defaultFeeds,
  type InboxMessage,
  useCourier,
} from "@trycourier/courier-react";
import type React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  activeCourierNotifications,
  archiveCourierNotification,
  type CourierNotificationItem,
  courierNotificationItem,
  openCourierNotification,
} from "./courier-notifications";
import {
  type CourierClientSession,
  CourierSessionManager,
  loadCourierSession,
} from "./courier-session";

type CourierNotificationStatus =
  | "loading"
  | "ready"
  | "signed-out"
  | "unavailable";

interface CourierNotificationsContextValue {
  status: CourierNotificationStatus;
  notifications: CourierNotificationItem[];
  activeNotifications: CourierNotificationItem[];
  open: (
    item: CourierNotificationItem,
    routeThread?: (threadId: string) => void,
  ) => Promise<void>;
  archive: (item: CourierNotificationItem) => Promise<void>;
}

const CourierNotificationsContext =
  createContext<CourierNotificationsContextValue | null>(null);

function uniqueMessages(feeds: Record<string, { messages: InboxMessage[] }>) {
  const messages = new Map<string, InboxMessage>();
  for (const dataset of Object.values(feeds)) {
    for (const message of dataset.messages) {
      messages.set(message.messageId, message);
    }
  }
  return [...messages.values()].sort(
    (a, b) => Date.parse(b.created ?? "") - Date.parse(a.created ?? ""),
  );
}

export function CourierNotificationsProvider({
  children,
  onNewMessage,
  refreshKey,
}: {
  children: React.ReactNode;
  onNewMessage?: (message: CourierNotificationItem) => void;
  refreshKey?: unknown;
}): React.JSX.Element {
  const courier = useCourier();
  const courierRef = useRef(courier);
  courierRef.current = courier;
  const onNewMessageRef = useRef(onNewMessage);
  onNewMessageRef.current = onNewMessage;
  const [status, setStatus] = useState<CourierNotificationStatus>("loading");
  const managerRef = useRef<CourierSessionManager | null>(null);
  const observedInitialRefreshKeyRef = useRef(false);
  const socketCleanupRef = useRef<(() => void) | null>(null);
  const signedUserRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    const clearSocket = (): void => {
      socketCleanupRef.current?.();
      socketCleanupRef.current = null;
    };
    const onSession = async (session: CourierClientSession): Promise<void> => {
      const sdk = courierRef.current;
      const sameUser = signedUserRef.current === session.userId;
      clearSocket();
      sdk.auth.signIn({ userId: session.userId, jwt: session.token });
      if (!sameUser) sdk.inbox.registerFeeds(defaultFeeds());
      await sdk.inbox.load({ canUseCache: sameUser });
      if (!active) {
        sdk.auth.signOut();
        return;
      }
      const socket = sdk.shared.client?.inbox.socket;
      if (!socket) throw new Error("Courier Inbox did not initialize");
      socketCleanupRef.current = socket.addMessageEventListener((event) => {
        if (event.event !== "message" || !event.data) return;
        onNewMessageRef.current?.(courierNotificationItem(event.data));
      });
      await sdk.inbox.listenForUpdates();
      if (!active) {
        clearSocket();
        sdk.auth.signOut();
        return;
      }
      signedUserRef.current = session.userId;
      setStatus("ready");
    };
    const onSignedOut = (): void => {
      clearSocket();
      courierRef.current.auth.signOut();
      courierRef.current.inbox.registerFeeds(defaultFeeds());
      signedUserRef.current = null;
      setStatus("signed-out");
    };
    const manager = new CourierSessionManager({
      load: loadCourierSession,
      onSession,
      onSignedOut,
      onUnavailable: () => {
        if (active && !signedUserRef.current) setStatus("unavailable");
      },
    });
    managerRef.current = manager;
    manager.start();
    return () => {
      active = false;
      manager.stop();
      clearSocket();
      courierRef.current.auth.signOut();
      managerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!observedInitialRefreshKeyRef.current) {
      observedInitialRefreshKeyRef.current = true;
      return;
    }
    if (refreshKey === undefined) return;
    managerRef.current?.refresh();
  }, [refreshKey]);

  const messages = useMemo(
    () => (status === "ready" ? uniqueMessages(courier.inbox.feeds) : []),
    [courier.inbox.feeds, status],
  );
  const notifications = useMemo(
    () => messages.map(courierNotificationItem),
    [messages],
  );
  const activeNotifications = useMemo(
    () => activeCourierNotifications(messages),
    [messages],
  );

  const open = useCallback(
    (item: CourierNotificationItem, routeThread?: (threadId: string) => void) =>
      openCourierNotification(item, courierRef.current.inbox, routeThread),
    [],
  );
  const archive = useCallback(
    (item: CourierNotificationItem) =>
      archiveCourierNotification(item, courierRef.current.inbox),
    [],
  );

  const value = useMemo(
    () => ({ status, notifications, activeNotifications, open, archive }),
    [activeNotifications, archive, notifications, open, status],
  );
  return (
    <CourierNotificationsContext.Provider value={value}>
      {children}
    </CourierNotificationsContext.Provider>
  );
}

export function useCourierNotifications(): CourierNotificationsContextValue {
  const value = useContext(CourierNotificationsContext);
  if (!value) {
    throw new Error(
      "useCourierNotifications must be used within CourierNotificationsProvider",
    );
  }
  return value;
}
