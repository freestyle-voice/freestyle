import { describe, expect, it } from "vitest";
import {
  type PanelRendererMessage,
  PanelRendererMessageQueue,
} from "./panel-renderer-message-queue";

describe("PanelRendererMessageQueue", () => {
  it("holds the latest navigation until the dashboard registers listeners", () => {
    const delivered: PanelRendererMessage[] = [];
    const queue = new PanelRendererMessageQueue((message) =>
      delivered.push(message),
    );
    queue.send({ channel: "dashboard:navigate", payload: "/today" });
    queue.send({ channel: "dashboard:navigate", payload: "/settings" });
    expect(delivered).toEqual([]);
    queue.markReady();
    queue.markReady();
    expect(delivered).toEqual([
      { channel: "dashboard:navigate", payload: "/settings" },
    ]);
  });
  it("retains initial navigation but waits for readiness again after a reload", () => {
    const delivered: PanelRendererMessage[] = [];
    const queue = new PanelRendererMessageQueue((message) =>
      delivered.push(message),
    );
    queue.send({ channel: "dashboard:navigate", payload: "/settings" });
    queue.handleNavigationStart();
    queue.markReady();
    expect(delivered).toHaveLength(1);
    queue.handleNavigationStart();
    queue.send({ channel: "dashboard:navigate", payload: "/settings/models" });
    expect(delivered).toHaveLength(1);
    queue.markReady();
    expect(delivered.at(-1)).toEqual({
      channel: "dashboard:navigate",
      payload: "/settings/models",
    });
  });
  it("drops stale navigation when the dashboard is recreated", () => {
    const delivered: PanelRendererMessage[] = [];
    const queue = new PanelRendererMessageQueue((message) =>
      delivered.push(message),
    );
    queue.send({ channel: "dashboard:navigate", payload: "/settings" });
    queue.reset();
    queue.markReady();
    expect(delivered).toEqual([]);
  });
});
