import "../overlay.css";
import "../tavern.css";

import { capture } from "@renderer/lib/analytics";
import { initApiBase, refreshApiBase } from "@renderer/lib/api";
import type { CourierNotificationItem } from "@renderer/lib/courier-notifications";
import {
  CourierNotificationsProvider,
  useCourierNotifications,
} from "@renderer/lib/courier-provider";
import { installGlobalErrorHandlers } from "@renderer/lib/report-error";
import type React from "react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

function NotificationCard({
  item,
  onOpen,
  onDismiss,
  badge,
  onExpand,
}: {
  item: CourierNotificationItem;
  onOpen: (id: string) => void;
  onDismiss: (id: string) => void;
  badge: number;
  onExpand: () => void;
}): React.JSX.Element {
  return (
    <div className="tavern-bub">
      <div className="tavern-bub-row">
        <button
          type="button"
          className="tavern-bub-main"
          onClick={() => onOpen(item.id)}
        >
          <span className="tavern-bub-title">{item.title}</span>
          <span className="tavern-bub-body">{item.body}</span>
        </button>
        <button
          type="button"
          className="tavern-bub-x"
          aria-label="Dismiss"
          onClick={() => onDismiss(item.id)}
        >
          ×
        </button>
      </div>
      {badge > 0 ? (
        <button type="button" className="tavern-bub-badge" onClick={onExpand}>
          +{badge} more
        </button>
      ) : null}
      <span className="tavern-bub-tail-o" />
      <span className="tavern-bub-tail-f" />
    </div>
  );
}

function NotificationStack(): React.JSX.Element | null {
  const {
    notifications,
    activeNotifications: items,
    open: openNotification,
    archive,
  } = useCourierNotifications();
  const [expanded, setExpanded] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const seenRef = useRef(new Set<string>());

  useEffect(() => {
    window.api.notificationSetVisible(items.length > 0);
  }, [items.length]);

  useEffect(() => {
    const off = window.api.onNotificationNativeClick((messageId) => {
      const item = notifications.find(
        (candidate) => candidate.id === messageId,
      );
      if (!item) return;
      void openNotification(item, window.api.notificationOpenThread);
    });
    return () => off?.();
  }, [notifications, openNotification]);

  useEffect(() => {
    for (const item of items) {
      if (seenRef.current.has(item.id)) continue;
      seenRef.current.add(item.id);
      capture("notification_shown", { surface: "bubble", kind: "thread" });
    }
  }, [items]);

  useLayoutEffect(() => {
    const height = rootRef.current?.offsetHeight ?? 0;
    if (height > 0) window.api.notificationSetHeight(height + 8);
    if (items.length <= 1) setExpanded(false);
  }, [items]);

  const ageOf = (id: string): number | null => {
    const item = items.find((n) => n.id === id);
    return item ? Date.now() - item.createdAt : null;
  };

  const dismiss = (id: string): void => {
    capture("notification_dismissed", { surface: "bubble", ageMs: ageOf(id) });
    const item = items.find((candidate) => candidate.id === id);
    if (item) void archive(item);
  };

  const openItem = (id: string): void => {
    capture("notification_opened", { surface: "bubble", ageMs: ageOf(id) });
    const item = items.find((candidate) => candidate.id === id);
    if (item) void openNotification(item, window.api.notificationOpenThread);
  };

  if (items.length === 0) return null;

  const shown = expanded ? items : items.slice(0, 1);

  return (
    <section
      className="tavern tavern-bub-stack"
      ref={rootRef}
      aria-label="Notifications"
    >
      {shown.map((item, index) => (
        <NotificationCard
          key={item.id}
          item={item}
          onOpen={openItem}
          onDismiss={dismiss}
          badge={!expanded && index === 0 ? items.length - 1 : 0}
          onExpand={() => setExpanded(true)}
        />
      ))}
    </section>
  );
}

initApiBase();
installGlobalErrorHandlers();

function NotificationRoot(): React.JSX.Element {
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const refresh = (): void => setRefreshKey((current) => current + 1);
    const offAuth = window.api.onNotificationAuthChanged(refresh);
    const offServer = window.api.onServerChanged(() => {
      void refreshApiBase().then(refresh);
    });
    return () => {
      offAuth?.();
      offServer?.();
    };
  }, []);

  return (
    <CourierNotificationsProvider
      refreshKey={refreshKey}
      onNewMessage={(item) =>
        window.api.notificationPresent({
          messageId: item.id,
          title: item.title,
          body: item.body,
        })
      }
    >
      <NotificationStack />
    </CourierNotificationsProvider>
  );
}

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(<NotificationRoot />);
}
