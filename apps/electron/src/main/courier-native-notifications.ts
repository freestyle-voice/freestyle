export interface CourierNativeNotification {
  messageId: string;
  title: string;
  body: string;
}

type ShowNotification = (
  title: string,
  body: string,
  onClick: () => void,
) => void;

export class CourierNativeNotificationPresenter {
  private readonly presented = new Set<string>();

  constructor(
    private readonly showNotification: ShowNotification,
    private readonly onClick: (messageId: string) => void,
  ) {}

  present(notification: CourierNativeNotification): void {
    if (this.presented.has(notification.messageId)) return;
    this.presented.add(notification.messageId);
    let clicked = false;
    this.showNotification(notification.title, notification.body, () => {
      if (clicked) return;
      clicked = true;
      this.onClick(notification.messageId);
    });
  }

  clear(messageId: string): void {
    this.presented.delete(messageId);
  }

  clearAll(): void {
    this.presented.clear();
  }
}
