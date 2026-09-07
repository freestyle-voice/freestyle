import { describe, expect, it } from "vitest";
import { describeRemixRun } from "./remix-run-state";

describe("Remix run status", () => {
  it("prioritizes a connected-app approval over a running turn", () => {
    expect(
      describeRemixRun({
        activeTurn: { id: "turn-1", status: "running", error: null },
        pendingAction: {
          id: "action-1",
          turnId: "turn-1",
          kind: "connector",
          status: "pending",
          toolName: "connector__gmail__send",
          display: "Send a draft through Gmail",
          capability: "gmail.send",
          expiresAt: "2026-09-08T12:00:00.000Z",
        },
      }),
    ).toEqual({
      state: "approval",
      title: "Approval needed",
      detail: "Review the connected-app action before Remix can continue.",
      turnId: "turn-1",
    });
  });

  it("makes a claimed desktop action visible instead of describing it as generic work", () => {
    expect(
      describeRemixRun({
        activeTurn: { id: "turn-2", status: "waiting_desktop", error: null },
        pendingAction: {
          id: "action-2",
          turnId: "turn-2",
          kind: "desktop",
          status: "pending",
          toolName: "Write",
          display: "Save the outline to notes.md",
          capability: "files.write",
          expiresAt: "2026-09-08T12:00:00.000Z",
        },
      }),
    ).toEqual({
      state: "desktop",
      title: "Action ready on this desktop",
      detail: "Open it here to let Remix continue.",
      turnId: "turn-2",
    });
  });

  it("keeps an active turn legible when no action needs the user", () => {
    expect(
      describeRemixRun({
        activeTurn: { id: "turn-3", status: "running", error: null },
        pendingAction: null,
      }),
    ).toEqual({
      state: "working",
      title: "Remix is working",
      detail: "Follow its progress or send a follow-up.",
      turnId: "turn-3",
    });
  });

  it("keeps a claimed action in progress instead of asking for approval again", () => {
    expect(
      describeRemixRun({
        activeTurn: {
          id: "turn-claimed",
          status: "waiting_approval",
          error: null,
        },
        pendingAction: {
          id: "action-claimed",
          turnId: "turn-claimed",
          kind: "connector",
          status: "claimed",
          toolName: "connector__gmail__send",
          display: "Send a draft through Gmail",
          capability: "gmail.send",
          expiresAt: "2026-09-08T12:00:00.000Z",
        },
      }),
    ).toEqual({
      state: "working",
      title: "Remix is completing an approved action",
      detail: "Follow its progress while Remix finishes this step.",
      turnId: "turn-claimed",
    });
  });

  it("keeps an expired desktop action recoverable instead of calling it working", () => {
    expect(
      describeRemixRun({
        activeTurn: {
          id: "turn-desktop",
          status: "needs_desktop",
          error: "The desktop action expired.",
        },
        pendingAction: null,
      }),
    ).toEqual({
      state: "desktop",
      title: "A desktop is needed",
      detail:
        "The desktop action expired. Reconnect an available Freestyle desktop to continue.",
      turnId: "turn-desktop",
    });
  });

  it("shows an in-flight local approval in the rail before durable state catches up", () => {
    expect(
      describeRemixRun(
        {
          activeTurn: { id: "turn-4", status: "running", error: null },
          pendingAction: null,
        },
        true,
      ),
    ).toEqual({
      state: "approval",
      title: "Approval needed",
      detail: "Review the local action before Remix can continue.",
      turnId: "turn-4",
    });
  });
});
