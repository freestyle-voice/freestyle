type NotificationChangeListener = () => void;

class NotificationEvents {
  private readonly listeners = new Set<NotificationChangeListener>();

  subscribe(listener: NotificationChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emitChange(): void {
    for (const listener of this.listeners) listener();
  }
}

export const notificationEvents = new NotificationEvents();
