import { describe, expect, it } from "vitest";
import {
  type PanelRendererMessage,
  PanelRendererMessageQueue,
} from "./panel-renderer-message-queue";

describe("PanelRendererMessageQueue", () => {
  it("delivers a final dictation received before the renderer registers its listeners", () => {
    const delivered: PanelRendererMessage[] = [];
    const queue = new PanelRendererMessageQueue((message) => {
      delivered.push(message);
    });

    queue.send({
      channel: "panel:dictation",
      payload: { kind: "final", text: "Schedule my daily briefing" },
    });

    expect(delivered).toEqual([]);

    queue.markReady();

    expect(delivered).toEqual([
      {
        channel: "panel:dictation",
        payload: { kind: "final", text: "Schedule my daily briefing" },
      },
    ]);
  });

  it("preserves composer focus before the final dictation while the renderer loads", () => {
    const delivered: PanelRendererMessage[] = [];
    const queue = new PanelRendererMessageQueue((message) => {
      delivered.push(message);
    });

    queue.send({ channel: "panel:focus-composer" });
    queue.send({
      channel: "panel:dictation",
      payload: { kind: "final", text: "Write a follow-up" },
    });

    queue.markReady();

    expect(delivered).toEqual([
      { channel: "panel:focus-composer" },
      {
        channel: "panel:dictation",
        payload: { kind: "final", text: "Write a follow-up" },
      },
    ]);
  });

  it("navigates to Remix before delivering queued workspace interaction", () => {
    const delivered: PanelRendererMessage[] = [];
    const queue = new PanelRendererMessageQueue((message) => {
      delivered.push(message);
    });

    queue.send({ channel: "dashboard:navigate", payload: "/remix" });
    queue.send({ channel: "panel:focus-composer" });

    queue.markReady();

    expect(delivered).toEqual([
      { channel: "dashboard:navigate", payload: "/remix" },
      { channel: "panel:focus-composer" },
    ]);
  });

  it("delivers a queued thread refresh after the selected thread", () => {
    const delivered: PanelRendererMessage[] = [];
    const queue = new PanelRendererMessageQueue((message) => {
      delivered.push(message);
    });

    queue.send({ channel: "panel:open-thread", payload: "thread-1" });
    queue.send({ channel: "panel:thread-updated", payload: "thread-1" });

    queue.markReady();

    expect(delivered).toEqual([
      { channel: "panel:open-thread", payload: "thread-1" },
      { channel: "panel:thread-updated", payload: "thread-1" },
    ]);
  });

  it("delivers a queued Settings navigation once the workspace is ready", () => {
    const delivered: PanelRendererMessage[] = [];
    const queue = new PanelRendererMessageQueue((message) => {
      delivered.push(message);
    });

    queue.send({ channel: "dashboard:navigate", payload: "/settings" });

    expect(delivered).toEqual([]);

    queue.markReady();

    expect(delivered).toEqual([
      { channel: "dashboard:navigate", payload: "/settings" },
    ]);
  });

  it("keeps only the latest dictation state while the renderer is unready", () => {
    const delivered: PanelRendererMessage[] = [];
    const queue = new PanelRendererMessageQueue((message) => {
      delivered.push(message);
    });

    queue.send({
      channel: "panel:dictation",
      payload: { kind: "partial", text: "Write a" },
    });
    queue.send({
      channel: "panel:dictation",
      payload: { kind: "partial", text: "Write a follow-up" },
    });
    queue.send({
      channel: "panel:dictation",
      payload: { kind: "final", text: "Write a follow-up email" },
    });

    queue.markReady();

    expect(delivered).toEqual([
      {
        channel: "panel:dictation",
        payload: { kind: "final", text: "Write a follow-up email" },
      },
    ]);
  });

  it("waits for readiness again after a renderer navigation", () => {
    const delivered: PanelRendererMessage[] = [];
    const queue = new PanelRendererMessageQueue((message) => {
      delivered.push(message);
    });

    queue.handleNavigationStart();
    queue.markReady();
    queue.send({
      channel: "panel:dictation",
      payload: { kind: "final", text: "First transcript" },
    });

    queue.handleNavigationStart();
    queue.send({
      channel: "panel:dictation",
      payload: { kind: "final", text: "Transcript after reload" },
    });

    expect(delivered).toEqual([
      {
        channel: "panel:dictation",
        payload: { kind: "final", text: "First transcript" },
      },
    ]);

    queue.markReady();

    expect(delivered.at(-1)).toEqual({
      channel: "panel:dictation",
      payload: { kind: "final", text: "Transcript after reload" },
    });
  });
});
