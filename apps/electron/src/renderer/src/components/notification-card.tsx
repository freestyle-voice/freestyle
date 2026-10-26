import type { CourierNotificationItem } from "@renderer/lib/courier-notifications";

export function NotificationCard({
  item,
  onOpen,
  onDismiss,
  badge,
  onExpand,
}: {
  item: Pick<CourierNotificationItem, "id" | "title" | "body">;
  onOpen: (id: string) => void;
  onDismiss: (id: string) => void;
  badge: number;
  onExpand: () => void;
}) {
  return (
    <div className="remix-notification">
      <div className="remix-notification-row">
        <button
          type="button"
          className="remix-notification-main"
          onClick={() => onOpen(item.id)}
        >
          <span className="remix-notification-title">{item.title}</span>
          <span className="remix-notification-body">{item.body}</span>
        </button>
        <button
          type="button"
          className="remix-notification-dismiss"
          aria-label="Dismiss"
          onClick={() => onDismiss(item.id)}
        >
          ×
        </button>
      </div>
      {badge > 0 ? (
        <button
          type="button"
          className="remix-notification-more"
          onClick={onExpand}
        >
          +{badge} more
        </button>
      ) : null}
    </div>
  );
}
