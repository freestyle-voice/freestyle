import "../overlay.css";
import "../tavern.css";

import { initApiBase } from "@renderer/lib/api";
import { installGlobalErrorHandlers } from "@renderer/lib/report-error";
import type React from "react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";

interface NotificationItem {
  id: string;
  origin: "cloud" | "local";
  kind: "thread" | "info";
  title: string;
  body: string;
  createdAt: number;
  seenAt: number | null;
}

function NotificationCard({
  item,
  onOpen,
  onDismiss,
  badge,
  onExpand,
}: {
  item: NotificationItem;
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
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [expanded, setExpanded] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const load = useCallback((): void => {
    void window.api
      .notificationsList()
      .then((next) => setItems(next as NotificationItem[]))
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const off = window.api.onNotificationsChanged(load);
    return () => off?.();
  }, [load]);

  useLayoutEffect(() => {
    const height = rootRef.current?.offsetHeight ?? 0;
    if (height > 0) window.api.notificationSetHeight(height + 8);
    if (items.length <= 1) setExpanded(false);
  }, [items]);

  const dismiss = (id: string): void => {
    setItems((prev) => prev.filter((n) => n.id !== id));
    window.api.notificationDismiss(id);
  };

  const open = (id: string): void => {
    setItems((prev) => prev.filter((n) => n.id !== id));
    window.api.notificationOpen(id);
  };

  if (items.length === 0) return null;

  const shown = expanded ? items : items.slice(0, 1);

  return (
    <div className="tavern tavern-bub-stack" ref={rootRef}>
      {shown.map((item, index) => (
        <NotificationCard
          key={item.id}
          item={item}
          onOpen={open}
          onDismiss={dismiss}
          badge={!expanded && index === 0 ? items.length - 1 : 0}
          onExpand={() => setExpanded(true)}
        />
      ))}
    </div>
  );
}

initApiBase();
installGlobalErrorHandlers();

const container = document.getElementById("root");
if (container) createRoot(container).render(<NotificationStack />);
