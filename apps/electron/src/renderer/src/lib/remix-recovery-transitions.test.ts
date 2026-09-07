import type { UIMessage } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RemixRecoveryController } from "./remix-recovery-controller";

const context = {
  selection: null,
  appName: null,
  windowTitle: null,
  capturedAt: 1,
};
function harness() {
  const storage = new Map<string, string>();
  const threads = new Map<string, UIMessage[]>();
  const turns = new Map<
    string,
    {
      id: string;
      threadId: string;
      clientRequestId: string;
      status: string;
      messages: UIMessage[];
      context: unknown;
    }
  >();
  const queued = new Map<
    string,
    { id: string; text: string; createdAt: number }
  >();
  const calls: Array<{
    path: string;
    body?: Record<string, unknown>;
    headers: Headers;
  }> = [];
  let owner = "a";
  let switchAfterIdentity = false;
  let offline = false;
  let loseClaim = false;
  let loseEnqueue = false;
  let loseRetry = false;
  let checkpointActionId = "";
  let replacements = 0;
  type Action = {
    id: string;
    turnId: string;
    kind: "desktop";
    toolName: string;
    status: string;
    claimedBy?: string;
    retryOfActionId?: string;
  };
  let action: Action | null = null;
  const predecessors = new Map<string, Action>();
  const executionOwners = new Map<string, string>();
  const replace = () => {
    const original = action!;
    predecessors.set(original.id, original);
    replacements++;
    action = {
      ...original,
      id: replacements === 1 ? "replacement" : `replacement-${replacements}`,
      status: "pending",
      claimedBy: undefined,
      retryOfActionId: original.id,
    };
    turns.get(action.turnId)!.status = "waiting_desktop";
  };
  const onToolCall = vi.fn(
    async (_call: {
      toolName: string;
      toolCallId: string;
      input: unknown;
      requiresConfirmation?: boolean;
    }) => {},
  );
  const onFork = vi.fn();
  const fetch = async (path: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const headers = new Headers(init?.headers);
    calls.push({ path, body, headers });
    if (path === "/api/remix/identity") {
      const response = Response.json({
        userId: owner,
        host: "https://cloud.test",
      });
      if (switchAfterIdentity) owner = "b";
      return response;
    }
    if (
      init?.method &&
      init.method !== "GET" &&
      (headers.get("X-Remix-User") !== owner ||
        headers.get("X-Remix-Host") !==
          encodeURIComponent("https://cloud.test"))
    )
      return Response.json({}, { status: 401 });
    if (path.endsWith("/queue")) {
      if (body?.requestId) {
        queued.set(
          body.requestId,
          queued.get(body.requestId) ?? {
            id: body.requestId,
            text: body.text,
            createdAt: Date.now(),
          },
        );
        if (loseEnqueue) {
          loseEnqueue = false;
          throw new Error("enqueue committed, response lost");
        }
      }
      return Response.json({ items: [...queued.values()], active: false });
    }
    if (offline) throw new Error("offline");
    if (path === "/api/remix/turns") {
      let turn = [...turns.values()].find(
        (turn) =>
          turn.threadId === body.threadId &&
          turn.clientRequestId === body.clientRequestId,
      );
      if (!turn) {
        turn = { ...body, id: crypto.randomUUID(), status: "running" };
        const messages = threads.get(body.threadId) ?? [];
        // Match Cloud's append-only, unseen-message-ID ingestion.
        for (const message of body.messages)
          if (!messages.some((saved) => saved.id === message.id))
            messages.push(message);
        threads.set(body.threadId, messages);
        turns.set(turn!.id, turn!);
      }
      return Response.json({ turn });
    }
    const turnId = path.split("/")[4];
    const turn = turns.get(turnId);
    if (path.includes("/actions/")) {
      const id = path.split("/").at(-1)!;
      return Response.json({
        action: action?.id === id ? action : predecessors.get(id),
      });
    }
    if (path.endsWith("/commands")) {
      if (body.type === "cancel") {
        turn!.status = "canceled";
        return Response.json({ receipt: { canceled: true } });
      }
      if (body.type === "desktop_complete") {
        if (
          predecessors.has(body.actionId) ||
          ["canceled", "completed", "failed"].includes(turn!.status)
        )
          return Response.json({}, { status: 409 });
        action = null;
        return Response.json({ receipt: { accepted: true } });
      }
      if (body.type === "desktop_claim") {
        if (
          !action ||
          (action.status !== "pending" &&
            (action.status !== "claimed" || action.claimedBy !== body.clientId))
        )
          return Response.json({}, { status: 409 });
        action.status = "claimed";
        action.claimedBy = body.clientId;
        if (loseClaim) {
          loseClaim = false;
          throw new Error("claim committed, response lost");
        }
        if (body.observerId) {
          const owner = executionOwners.get(action.id);
          if (owner && owner !== body.observerId)
            return Response.json({}, { status: 409 });
          executionOwners.set(action.id, body.observerId);
        }
        return Response.json({
          action: {
            id: action.id,
            toolName: action.toolName,
            input: { command: "pwd" },
          },
          receipt: { claimed: true },
        });
      }
      if (body.type === "retry_desktop") {
        replace();
        if (loseRetry) {
          loseRetry = false;
          throw new Error("replacement committed, response lost");
        }
        return Response.json({ action: { id: action!.id } });
      }
    }
    if (path.startsWith("/api/remix/thread/")) {
      const id = path.split("/").at(-1)!;
      return Response.json({
        thread: { id, messages: threads.get(id) ?? [] },
        activeTurn:
          [...turns.values()].find(
            (turn) =>
              turn.threadId === id &&
              !["canceled", "completed", "failed"].includes(turn.status),
          ) ?? null,
        pendingAction: action?.status === "expired" ? null : action,
      });
    }
    if (turn)
      return Response.json({
        turn,
        checkpoint: {
          messages: turn.messages,
          context: turn.context,
          toolState: action
            ? [{ actionId: action.id, status: action.status }]
            : [],
          assistant: action
            ? {
                id: "assistant-action",
                role: "assistant",
                parts: [
                  {
                    type: "dynamic-tool",
                    toolName: "Bash",
                    toolCallId: "invocation",
                    state: "output-available",
                    input: { command: "pwd" },
                    output: { desktopAction: { actionId: checkpointActionId } },
                  },
                ],
              }
            : null,
        },
      });
    return Response.json({}, { status: 404 });
  };
  const create = (
    threadId = "thread-a",
    messages: UIMessage[] = [],
    requiresApproval = true,
  ) =>
    new RemixRecoveryController({
      threadId,
      messages,
      fetch,
      storage: {
        getItem: (key) => storage.get(key) ?? null,
        setItem: (key, value) => {
          storage.set(key, value);
        },
      },
      onToolCall,
      requiresApproval: () => requiresApproval,
      onFork,
    });
  return {
    create,
    calls,
    threads,
    turns,
    queued,
    storage,
    onToolCall,
    onFork,
    offline: (value: boolean) => {
      offline = value;
    },
    switchOwner: () => {
      switchAfterIdentity = true;
    },
    loseEnqueue: () => {
      loseEnqueue = true;
    },
    loseClaim: () => {
      loseClaim = true;
    },
    loseRetry: () => {
      loseRetry = true;
    },
    replace,
    approval: (toolName = "Bash") => {
      const turn = [...turns.values()][0];
      action = {
        id: "action-a",
        turnId: turn.id,
        kind: "desktop",
        status: "pending",
        toolName,
      };
      checkpointActionId = action.id;
    },
    expire: () => {
      action!.status = "expired";
      turns.get(action!.turnId)!.status = "needs_desktop";
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

describe("durable persistence-boundary regressions", () => {
  it("serializes simultaneous confirmations within the same observer", async () => {
    const h = harness();
    const controller = h.create();
    await controller.send("Run", context);
    h.approval();
    await controller.start();
    const confirmations = await Promise.allSettled([
      controller.authorizeTool("action-a"),
      controller.authorizeTool("action-a"),
    ]);
    expect(confirmations.map((result) => result.status).sort()).toEqual([
      "fulfilled",
      "rejected",
    ]);
    expect(
      h.calls.filter((call) => call.body?.type === "desktop_claim"),
    ).toHaveLength(1);
  });
  it.each([
    false,
    true,
  ])("allows only one reattached observer to execute a shared uncertain claim (concurrent: %s)", async (concurrent) => {
    const h = harness();
    const first = h.create();
    await first.send("Run", context);
    h.approval();
    await first.start();
    h.loseClaim();
    await expect(first.authorizeTool("action-a")).rejects.toThrow();
    first.dispose();
    const compact = h.create();
    const workspace = h.create();
    await Promise.all([compact.start(), workspace.start()]);
    const executed: string[] = [];
    const allow = (controller: RemixRecoveryController, label: string) =>
      controller.authorizeTool("action-a").then(() => executed.push(label));
    if (concurrent)
      await Promise.allSettled([
        allow(compact, "compact"),
        allow(workspace, "workspace"),
      ]);
    else {
      await allow(compact, "compact");
      await expect(allow(workspace, "workspace")).rejects.toThrow();
    }
    expect(executed).toHaveLength(1);
  });
  it("does not let a stale second observer execute a reviewed replacement before confirmation", async () => {
    const h = harness();
    const compact = h.create("thread-a", [], false);
    await compact.send("Run", context);
    h.approval("paste");
    h.expire();
    await compact.start();
    const workspace = h.create("thread-a", [], false);
    await workspace.start();
    await compact.retryDesktop();
    await workspace.start();
    expect(
      h.calls.filter((call) => call.body?.type === "desktop_claim"),
    ).toHaveLength(0);
    expect(h.onToolCall.mock.calls).toHaveLength(2);
    for (const [call] of h.onToolCall.mock.calls)
      expect(call).toMatchObject({
        toolCallId: "replacement",
        requiresConfirmation: true,
      });
  });
  it("retires an offline expired completion and presents a replacement created by another observer", async () => {
    const h = harness();
    const first = h.create();
    await first.send("Run", context);
    h.approval();
    await first.start();
    await first.authorizeTool("action-a");
    h.offline(true);
    await first.complete("action-a", { ok: true });
    first.dispose();
    h.expire();
    h.replace();
    h.offline(false);
    h.onToolCall.mockClear();
    const reopened = h.create();
    await reopened.start();
    expect(reopened.getSnapshot().status).toBe("streaming");
    expect(h.onToolCall).toHaveBeenCalledWith(
      expect.objectContaining({
        toolCallId: "replacement",
        requiresConfirmation: true,
      }),
    );
    expect(JSON.parse([...h.storage.values()][0]).completions).toEqual([]);
  });
  it("binds the initialized owner to the admission even when the backing account changes", async () => {
    const h = harness();
    h.switchOwner();
    const controller = h.create();
    await controller.send("Private A", context);
    expect(h.turns.size).toBe(0);
    expect(
      h.calls
        .find((call) => call.path === "/api/remix/turns")!
        .headers.get("X-Remix-User"),
    ).toBe("a");
    expect(controller.getSnapshot().status).toBe("error");
  });
  it("retires offline completion after Stop and can send again after observer restart", async () => {
    const h = harness();
    const first = h.create();
    await first.send("Run", context);
    h.approval();
    await first.start();
    await first.authorizeTool("action-a");
    h.offline(true);
    await first.complete("action-a", { ok: true });
    await first.stop();
    first.dispose();
    h.offline(false);
    const second = h.create();
    await second.start();
    await second.send("A new request", context);
    expect(h.turns.size).toBe(2);
    expect(
      [...h.storage.values()].every(
        (saved) => JSON.parse(saved).completions.length === 0,
      ),
    ).toBe(true);
  });
  it("recovers a committed claim with the same claimant across an observer restart", async () => {
    const h = harness();
    const first = h.create();
    await first.send("Run", context);
    h.approval();
    await first.start();
    h.loseClaim();
    await expect(first.authorizeTool("action-a")).rejects.toThrow(
      "response lost",
    );
    first.dispose();
    const second = h.create();
    await second.start();
    await second.authorizeTool("action-a");
    const claims = h.calls.filter(
      (call) => call.body?.type === "desktop_claim",
    );
    expect(claims).toHaveLength(2);
    expect(claims[1].body!.clientId).toBe(claims[0].body!.clientId);
    await second.complete("action-a", { ok: true });
    expect(
      h.calls.filter((call) => call.body?.type === "desktop_complete"),
    ).toHaveLength(1);
  });
  it("requires a fresh user decision after an expired claim replacement", async () => {
    const h = harness();
    const first = h.create();
    await first.send("Run", context);
    h.approval();
    await first.start();
    h.loseClaim();
    await expect(first.authorizeTool("action-a")).rejects.toThrow();
    h.expire();
    await first.start();
    expect(first.getSnapshot().desktopRecovery?.actionId).toBe("action-a");
    await first.retryDesktop();
    expect(
      h.calls.filter((call) => call.body?.type === "desktop_claim"),
    ).toHaveLength(1);
    expect(h.onToolCall).toHaveBeenLastCalledWith(
      expect.objectContaining({
        toolCallId: "replacement",
        requiresConfirmation: true,
      }),
    );
    await first.authorizeTool("replacement");
    expect(
      h.calls.filter((call) => call.body?.type === "desktop_claim"),
    ).toHaveLength(2);
  });
  it("recovers an uncertain replacement without executing it and retires its retry intent", async () => {
    const h = harness();
    const first = h.create();
    await first.send("Run", context);
    h.approval();
    await first.start();
    h.loseClaim();
    await expect(first.authorizeTool("action-a")).rejects.toThrow();
    h.expire();
    await first.start();
    h.loseRetry();
    await expect(first.retryDesktop()).rejects.toThrow();
    first.dispose();
    const second = h.create();
    await second.start();
    expect(
      h.calls.filter((call) => call.body?.type === "desktop_claim"),
    ).toHaveLength(1);
    expect(h.onToolCall).toHaveBeenLastCalledWith(
      expect.objectContaining({
        toolCallId: "replacement",
        requiresConfirmation: true,
      }),
    );
    await second.authorizeTool("replacement");
    await second.complete("replacement", { ok: true });
    const saved = JSON.parse([...h.storage.values()][0]);
    expect(saved.desktopRetries).toEqual({});
    expect(saved.retrySources).toEqual({});
    expect(saved.confirmActions).toEqual([]);
  });
  it("reviews the latest expired replacement even while assistant output names the original action", async () => {
    const h = harness();
    const controller = h.create();
    await controller.send("Run", context);
    h.approval();
    await controller.start();
    h.expire();
    await controller.start();
    await controller.retryDesktop();
    h.expire();
    await controller.start();
    expect(controller.getSnapshot().desktopRecovery?.actionId).toBe(
      "replacement",
    );
    await controller.retryDesktop();
    expect(h.onToolCall).toHaveBeenLastCalledWith(
      expect.objectContaining({
        toolCallId: "replacement-2",
        requiresConfirmation: true,
      }),
    );
    await controller.authorizeTool("replacement-2");
    await controller.complete("replacement-2", { ok: true });
    const saved = JSON.parse([...h.storage.values()][0]);
    expect(saved.desktopRetries).toEqual({});
    expect(saved.retrySources).toEqual({});
  });
  it.each([
    "Edited question",
    "Old question",
  ])("branches edit/regenerate input '%s' without rewriting append-only history", async (text) => {
    const h = harness();
    const original: UIMessage[] = [
      {
        id: "old-user",
        role: "user",
        parts: [{ type: "text", text: "Old question" }],
      },
      {
        id: "old-answer",
        role: "assistant",
        parts: [{ type: "text", text: "Old answer" }],
      },
      {
        id: "later-user",
        role: "user",
        parts: [{ type: "text", text: "Later question" }],
      },
    ];
    h.threads.set("thread-a", original);
    const first = h.create("thread-a", original);
    await first.send(text, context, "old-user");
    const fork = h.onFork.mock.calls[0][0];
    const second = h.create(fork.id, fork.messages);
    await second.start();
    expect(h.threads.get("thread-a")).toEqual(original);
    expect(h.threads.get(fork.id)).toHaveLength(1);
    expect(h.threads.get(fork.id)![0]).toMatchObject({
      parts: [{ type: "text", text }],
    });
    expect(h.threads.get(fork.id)![0].id).not.toBe("old-user");
  });
  it("replays a committed enqueue receipt after restart while keeping repeated sends distinct", async () => {
    const h = harness();
    const first = h.create();
    await first.send("Run", context);
    h.loseEnqueue();
    await first.enqueue("Follow up", context);
    expect(h.queued.size).toBe(1);
    first.dispose();
    const second = h.create();
    await second.start();
    expect(h.queued.size).toBe(1);
    const writes = h.calls.filter((call) => call.body?.requestId);
    expect(writes).toHaveLength(2);
    expect(writes[1].body!.requestId).toBe(writes[0].body!.requestId);
    await second.enqueue("Follow up", context);
    expect(h.queued.size).toBe(2);
  });
});
