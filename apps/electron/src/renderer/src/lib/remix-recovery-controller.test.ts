import type { UIMessage } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  REMIX_CONTINUATION,
  RemixRecoveryController,
} from "./remix-recovery-controller";

const context = {
  selection: null,
  appName: null,
  windowTitle: null,
  capturedAt: 1,
};
function fixture() {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  let offline = false;
  let status = "running";
  let messages: UIMessage[] = [];
  let requestId = "";
  let action: Record<string, unknown> | null = null;
  let assistant: UIMessage | null = null;
  const queue: Array<{ id: string; text: string; createdAt: number }> = [];
  const requests: Array<{
    path: string;
    body?: Record<string, unknown>;
    at: number;
  }> = [];
  const fetch = vi.fn(async (path: string, init?: RequestInit) => {
    const body = init?.body
      ? (JSON.parse(String(init.body)) as Record<string, unknown>)
      : undefined;
    requests.push({ path, body, at: Date.now() });
    if (path === "/api/remix/identity")
      return Response.json({ userId: "user-a", host: "https://cloud.test" });
    if (path === "/api/remix/thread-a/queue") {
      if (body?.text)
        queue.push({
          id: String(body.requestId),
          text: String(body.text),
          createdAt: Date.now(),
        });
      return Response.json({
        items: queue,
        active:
          Boolean(requestId) &&
          !["completed", "failed", "canceled"].includes(status),
      });
    }
    if (offline) throw new TypeError("Network unavailable");
    if (path.includes("/actions/")) return Response.json({ action });
    if (path === "/api/remix/turns") {
      requestId = String(body!.clientRequestId);
      messages = body!.messages as UIMessage[];
      return Response.json(
        { turn: { id: "turn-a", status, clientRequestId: requestId } },
        { status: 202 },
      );
    }
    if (path.endsWith("/commands")) {
      if (body!.type === "cancel") status = "canceled";
      if (body!.type === "desktop_claim")
        return Response.json({
          action: { toolName: "Bash", input: { command: "pwd" } },
        });
      return Response.json({ receipt: { accepted: true } });
    }
    if (path === "/api/remix/thread/thread-a")
      return Response.json({
        thread: { id: "thread-a", messages },
        activeTurn: requestId ? { id: "turn-a", status } : null,
        pendingAction: action,
      });
    if (path === "/api/remix/turns/turn-a")
      return Response.json({
        turn: { id: "turn-a", status, clientRequestId: requestId },
        checkpoint: { messages, context, assistant },
      });
    return Response.json({}, { status: 404 });
  });
  const onToolCall = vi.fn(async () => {});
  const onFinish = vi.fn();
  const onError = vi.fn();
  const create = () =>
    new RemixRecoveryController({
      threadId: "thread-a",
      messages: [],
      fetch,
      storage,
      onToolCall,
      onFinish,
      onError,
      requiresApproval: () => true,
    });
  return {
    create,
    requests,
    onToolCall,
    onFinish,
    onError,
    values,
    offline: (value: boolean) => {
      offline = value;
    },
    status: (value: string) => {
      status = value;
    },
    approval: () => {
      action = {
        id: "action-a",
        turnId: "turn-a",
        kind: "desktop",
        toolName: "Bash",
        status: "pending",
      };
      assistant = {
        id: "assistant-a",
        role: "assistant",
        parts: [
          {
            type: "dynamic-tool",
            toolName: "Bash",
            toolCallId: "call-a",
            state: "output-available",
            input: { command: "pwd" },
            output: { desktopAction: { actionId: "action-a" } },
          },
        ],
      };
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("durable Remix recovery", () => {
  it("makes exactly five reconnects at 3/6/12/24/30 seconds and pauses", async () => {
    const f = fixture();
    const controller = f.create();
    await controller.send("Hello", context);
    f.offline(true);
    await vi.advanceTimersByTimeAsync(1_000);
    for (const delay of [3_000, 6_000, 12_000, 24_000, 30_000]) {
      const before = f.requests.length;
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(f.requests).toHaveLength(before);
      await vi.advanceTimersByTimeAsync(1);
      expect(f.requests).toHaveLength(before + 1);
    }
    expect(controller.getSnapshot().recovery).toEqual({
      phase: "paused",
      attempts: 5,
    });
    const count = f.requests.length;
    await vi.advanceTimersByTimeAsync(100_000);
    expect(f.requests).toHaveLength(count);
    expect(
      f.requests.filter((request) => request.path === "/api/remix/turns"),
    ).toHaveLength(1);
  });

  it("retries immediately when clicked, cancels the old timer, and retains the receipt ID", async () => {
    const f = fixture();
    const controller = f.create();
    f.offline(true);
    await controller.send("Hello", context);
    const id = f.requests.find((request) => request.body?.clientRequestId)?.body
      ?.clientRequestId;
    await vi.advanceTimersByTimeAsync(500);
    await Promise.all([controller.retry(), controller.retry()]);
    const submissions = f.requests.filter(
      (request) => request.path === "/api/remix/turns",
    );
    expect(submissions).toHaveLength(2);
    expect(submissions[1].body?.clientRequestId).toBe(id);
    const count = f.requests.length;
    await vi.advanceTimersByTimeAsync(3_000);
    expect(f.requests).toHaveLength(count);
    expect(controller.getSnapshot().recovery).toEqual({
      phase: "reconnecting",
      attempts: 1,
      retryAt: 6_500,
    });
  });

  it.each([
    "completed",
    "failed",
    "canceled",
  ])("stops recovery at the authoritative %s state", async (status) => {
    const f = fixture();
    const controller = f.create();
    await controller.send("Hello", context);
    f.offline(true);
    await vi.advanceTimersByTimeAsync(1_000);
    f.offline(false);
    f.status(status);
    await controller.retry();
    expect(controller.getSnapshot().recovery.phase).toBe("idle");
    expect(controller.getSnapshot().status).toBe("ready");
    const count = f.requests.length;
    await vi.advanceTimersByTimeAsync(100_000);
    expect(f.requests).toHaveLength(count);
    expect(f.onFinish).toHaveBeenCalledOnce();
  });

  it("retains offline Stop and queued follow-ups through a window restart", async () => {
    const f = fixture();
    const first = f.create();
    await first.send("Hello", context);
    await first.enqueue("Follow up", context);
    f.offline(true);
    await first.stop();
    first.dispose();
    expect(first.getSnapshot().queue[0].text).toBe("Follow up");
    f.offline(false);
    const second = f.create();
    await second.start();
    expect(f.requests.some((request) => request.body?.type === "cancel")).toBe(
      true,
    );
    expect(second.getSnapshot().queue[0].text).toBe("Follow up");
    expect(
      f.requests.filter((request) => request.path === "/api/remix/turns"),
    ).toHaveLength(1);
  });

  it("Resume submits the visible continuation as a new immutable turn", async () => {
    const f = fixture();
    const controller = f.create();
    await controller.send("Hello", context);
    f.offline(true);
    await vi.advanceTimersByTimeAsync(76_000);
    expect(controller.getSnapshot().recovery.phase).toBe("paused");
    f.offline(false);
    f.status("running");
    await controller.resume(context);
    const submissions = f.requests.filter(
      (request) => request.path === "/api/remix/turns",
    );
    expect(submissions).toHaveLength(2);
    expect(submissions[1].body?.clientRequestId).not.toBe(
      submissions[0].body?.clientRequestId,
    );
    const messages = submissions[1].body?.messages as UIMessage[];
    expect(messages.at(-1)?.parts).toEqual([
      { type: "text", text: REMIX_CONTINUATION },
    ]);
  });

  it("keeps approval unclaimed during handoff and claims only on a user decision", async () => {
    const f = fixture();
    f.approval();
    const first = f.create();
    await first.send("Hello", context);
    expect(f.onToolCall).toHaveBeenCalledOnce();
    expect(
      f.requests.some((request) => request.body?.type === "desktop_claim"),
    ).toBe(false);
    first.dispose();
    const second = f.create();
    await second.start();
    expect(f.onToolCall).toHaveBeenCalledTimes(2);
    await second.authorizeTool("action-a");
    f.offline(true);
    await second.complete("action-a", { ok: true });
    second.dispose();
    f.offline(false);
    const third = f.create();
    await third.start();
    const completions = f.requests.filter(
      (request) => request.body?.type === "desktop_complete",
    );
    expect(completions.at(-1)?.body?.result).toEqual({ ok: true });
    expect(
      f.requests.filter((request) => request.body?.type === "desktop_claim"),
    ).toHaveLength(1);
  });

  it("uses a bounded observation cadence while a local approval awaits a decision", async () => {
    const f = fixture();
    f.approval();
    const controller = f.create();

    await controller.send("List my files", context);
    expect(f.onToolCall).toHaveBeenCalledOnce();

    const requestsAtApproval = f.requests.length;
    await vi.advanceTimersByTimeAsync(4_999);
    expect(f.requests).toHaveLength(requestsAtApproval);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.requests.length).toBeGreaterThan(requestsAtApproval);

    const requestsAfterRefresh = f.requests.length;
    await vi.advanceTimersByTimeAsync(4_999);
    expect(f.requests).toHaveLength(requestsAfterRefresh);
    await vi.advanceTimersByTimeAsync(1);
    expect(f.requests.length).toBeGreaterThan(requestsAfterRefresh);
  });

  it("does not mistake an infrastructure rate limit for a free-plan limit", async () => {
    const onError = vi.fn();
    const controller = new RemixRecoveryController({
      threadId: "thread-a",
      messages: [],
      fetch: async (path) =>
        path === "/api/remix/identity"
          ? Response.json({ userId: "user-a", host: "https://cloud.test" })
          : Response.json({ code: "rate_limited" }, { status: 429 }),
      onToolCall: vi.fn(async () => {}),
      onError,
    });

    await controller.start();
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "Remix is receiving too many updates. Try again in a moment.",
      }),
    );
  });

  it("hands queued follow-ups to the durable server owner", async () => {
    const f = fixture();
    const controller = f.create();
    await controller.send("Hello", context);
    await controller.enqueue("Follow up", context);
    expect(controller.getSnapshot().queue).toHaveLength(1);
    f.status("completed");
    await vi.advanceTimersByTimeAsync(1_001);
    expect(controller.getSnapshot().queue).toHaveLength(1);
    const submissions = f.requests.filter(
      (request) => request.path === "/api/remix/turns",
    );
    expect(submissions).toHaveLength(1);
    expect(
      f.requests.some(
        (request) =>
          request.path === "/api/remix/thread-a/queue" &&
          request.body?.text === "Follow up",
      ),
    ).toBe(true);
  });

  it("confirms an orphaned queue handoff once instead of polling it continuously", async () => {
    const f = fixture();
    const controller = f.create();

    await controller.enqueue("Follow up", context);
    await controller.start();
    const before = f.requests.length;

    await vi.advanceTimersByTimeAsync(5_000);

    expect(f.requests).toHaveLength(before + 2);
    const afterHandoffCheck = f.requests.length;
    await vi.advanceTimersByTimeAsync(5_000);
    expect(f.requests).toHaveLength(afterHandoffCheck);
    expect(controller.getSnapshot().queue).toHaveLength(1);
  });
});
