import { describe, expect, it, vi } from "vitest";
import { CourierNativeNotificationPresenter } from "./courier-native-notifications";

describe("CourierNativeNotificationPresenter", () => {
  it("returns a native click to the renderer exactly once per Courier message", () => {
    let click: (() => void) | undefined;
    const show = vi.fn((_title: string, _body: string, onClick: () => void) => {
      click = onClick;
    });
    const onClick = vi.fn();
    const presenter = new CourierNativeNotificationPresenter(show, onClick);

    presenter.present({
      messageId: "message-1",
      title: "Morning brief",
      body: "Your Remix is ready.",
    });
    presenter.present({
      messageId: "message-1",
      title: "Morning brief",
      body: "Your Remix is ready.",
    });
    click?.();
    click?.();

    expect(show).toHaveBeenCalledOnce();
    expect(onClick).toHaveBeenCalledOnce();
    expect(onClick).toHaveBeenCalledWith("message-1");
  });

  it("allows a later delivery after the message is cleared", () => {
    const show = vi.fn();
    const presenter = new CourierNativeNotificationPresenter(show, vi.fn());
    const item = { messageId: "message-1", title: "Ready", body: "Done" };

    presenter.present(item);
    presenter.clear("message-1");
    presenter.present(item);

    expect(show).toHaveBeenCalledTimes(2);
  });
});
