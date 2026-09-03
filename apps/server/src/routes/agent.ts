import { createAppLogger } from "@freestyle-voice/utils";
import { remixContextSchema } from "@freestyle-voice/validations";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod/v3";
import { agentActivityEvents } from "../lib/agent-activity-events.js";
import {
  type AgentQueuedMessage,
  agentMessageQueue,
} from "../lib/agent-message-queue.js";
import { trustedDesktopAgentFields } from "../lib/agent-request.js";
import { agentStreamStore } from "../lib/agent-stream-store.js";
import { freestyleCloudUrl } from "../lib/freestyle-cloud.js";
import { getSessionToken, invalidateSession } from "../lib/sessions.js";

const log = createAppLogger("agent");

const agentRequestSchema = z.object({
  messages: z.array(z.record(z.string(), z.unknown())).min(1),
  // DefaultChatTransport sends `id`; the renderer also supplies the stable
  // thread id explicitly. Preserve either form so Cloud can bind approval
  // grants to the same thread that will execute them.
  id: z.string().min(1).max(100).optional(),
  threadId: z.string().min(1).max(100).optional(),
  // The seeded turn right after onboarding — forwarded so the cloud can
  // append its one-turn system-prompt addendum.
  firstTurn: z.boolean().optional(),
  context: remixContextSchema.optional(),
});

const queueMessageSchema = z.object({
  text: z.string().trim().min(1).max(10_000),
  context: remixContextSchema.optional(),
});

const threadIdSchema = z.string().min(1).max(100);

type AgentRequest = z.infer<typeof agentRequestSchema>;

async function fetchCloudAgent(request: AgentRequest): Promise<Response> {
  const token = getSessionToken();
  if (!token) throw new Error("cloud_auth_required");
  const { messages, firstTurn, id, threadId, context } = request;
  return fetch(`${freestyleCloudUrl()}/v2/agent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messages,
      ...(threadId || id ? { threadId: threadId ?? id } : {}),
      ...(firstTurn ? { firstTurn: true } : {}),
      ...(context ? { context } : {}),
      ...trustedDesktopAgentFields(),
    }),
    // The local server owns the upstream reader. A pill/window renderer may
    // close its HTTP observer during a handoff, but it must not abort the
    // Cloud turn before the local server has drained and persisted it.
  });
}

async function fetchCloudThreadSnapshot(threadId: string): Promise<Response> {
  const token = getSessionToken();
  if (!token) throw new Error("cloud_auth_required");
  const response = await fetch(
    `${freestyleCloudUrl()}/v2/threads/${encodeURIComponent(threadId)}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
    },
  );
  if (response.status === 401) invalidateSession();
  return response;
}

async function cloudThreadMessages(
  threadId: string,
  previousMessageCount: number,
): Promise<unknown[]> {
  // The Cloud stream closes just before its persistence hook commits the
  // canonical messages. A short bounded retry avoids turning that normal
  // handoff race into a stranded local queue item.
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetchCloudThreadSnapshot(threadId);
    if (response.status === 401) {
      throw new Error("cloud_auth_required");
    }
    if (response.ok) {
      const payload = (await response.json()) as {
        thread?: { messages?: unknown };
      };
      if (
        Array.isArray(payload.thread?.messages) &&
        payload.thread.messages.length > previousMessageCount
      )
        return payload.thread.messages;
      if (attempt < 3) {
        await new Promise<void>((resolve) => setTimeout(resolve, 150));
        continue;
      }
      throw new Error("thread_snapshot_stale");
    }
    if (response.status !== 404 || attempt === 3)
      throw new Error(`thread_snapshot_${response.status}`);
    await new Promise<void>((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("thread_snapshot_unavailable");
}

function queuedUserMessage(item: AgentQueuedMessage) {
  return {
    id: crypto.randomUUID(),
    role: "user",
    parts: [{ type: "text", text: item.text }],
  };
}

/**
 * Start the next local queue entry only after the prior stream releases its
 * slot. Cloud remains the canonical history owner; after a normal completion
 * we refresh that thread before appending the queued user message. An explicit
 * steer is different: Cloud may not persist an interrupted partial response,
 * so retain the already-submitted local input base instead.
 */
async function drainQueuedTurn(
  threadId: string,
  previousInput: unknown[],
  interrupted: boolean,
): Promise<void> {
  if (agentStreamStore.isActive(threadId)) return;
  await agentMessageQueue.drain(threadId, async (item) => {
    const messages = [
      ...(interrupted
        ? previousInput
        : await cloudThreadMessages(threadId, previousInput.length)),
      queuedUserMessage(item),
    ];
    const upstream = await fetchCloudAgent({
      messages: messages as AgentRequest["messages"],
      threadId,
      ...(item.context
        ? { context: item.context as AgentRequest["context"] }
        : {}),
    });
    if (upstream.status === 401) invalidateSession();
    if (!upstream.ok || !upstream.body) {
      throw new Error(`queued_agent_${upstream.status}`);
    }
    agentStreamStore.startDetached(threadId, messages, upstream.body, {
      onComplete: ({ cancelled, inputMessages }) => {
        void drainQueuedTurn(threadId, inputMessages, cancelled).catch((err) =>
          log.error(`Queued Remix turn failed: ${err}`),
        );
      },
    });
  });
}

function queueSnapshot(threadId: string) {
  return {
    items: agentMessageQueue.list(threadId),
    active: agentStreamStore.isActive(threadId),
  };
}

/**
 * A compact activity index for the Remix sidebar. The local Hono server is
 * the owner of both the upstream stream and queued follow-ups, so it can tell
 * the UI whether a conversation is still in motion without exposing prompt
 * text, tool payloads, Cloud credentials, or one endpoint per session.
 */
function activitySnapshot() {
  const threadIds = new Set([
    ...agentStreamStore.activeThreadIds(),
    ...agentMessageQueue.threadIds(),
  ]);
  return {
    threads: [...threadIds].map((threadId) => ({
      threadId,
      active: agentStreamStore.isActive(threadId),
      queuedCount: agentMessageQueue.list(threadId).length,
    })),
  };
}

/**
 * One shared, authenticated activity feed for all Remix UI surfaces. The
 * payload deliberately remains metadata-only: no user input, agent output,
 * tools, credentials, or Cloud request details leave the local owner.
 */
function activityEventStream(): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;

  return new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (changedThreadId?: string) => {
        if (closed) return;
        try {
          controller.enqueue(
            encoder.encode(
              `event: activity\ndata: ${JSON.stringify({
                ...activitySnapshot(),
                changedThreadId: changedThreadId ?? null,
              })}\n\n`,
            ),
          );
        } catch {
          closed = true;
          unsubscribe?.();
        }
      };
      unsubscribe = agentActivityEvents.subscribe(send);
      // The first event is the initial snapshot, so connecting a renderer
      // never needs a second GET just to establish its current state.
      send();
    },
    cancel() {
      unsubscribe?.();
    },
  });
}

/**
 * One Remix workspace agent turn. The loop runs on the Worker (`/v2/agent`)
 * and this route is a streaming proxy — the renderer never holds the cloud
 * token, so the Bearer header is injected here from the server-side session.
 */
const agentRoute = new Hono()
  .post("/", zValidator("json", agentRequestSchema), async (c) => {
    const { messages, firstTurn, id, threadId, context } = c.req.valid("json");

    let upstream: Response;
    try {
      upstream = await fetchCloudAgent({
        messages,
        ...(id ? { id } : {}),
        ...(threadId ? { threadId } : {}),
        ...(firstTurn ? { firstTurn } : {}),
        ...(context ? { context } : {}),
      });
    } catch (err) {
      if (err instanceof Error && err.message === "cloud_auth_required")
        return c.json({ error: "cloud_auth_required" }, 401);
      log.error(`Agent cloud request failed: ${err}`);
      return c.json(
        { error: "failed", detail: "Couldn't reach Freestyle Cloud." },
        502,
      );
    }

    if (upstream.status === 401) {
      invalidateSession();
      return c.json({ error: "cloud_auth_required" }, 401);
    }
    if (upstream.status === 429) {
      const payload = (await upstream.json().catch(() => null)) as {
        resetsAt?: string;
      } | null;
      return c.json(
        { error: "usage_exceeded", resetsAt: payload?.resetsAt },
        429,
      );
    }
    if (!upstream.ok || !upstream.body) {
      const detail = await upstream.text().catch(() => "");
      log.error(
        `Agent cloud returned ${upstream.status}: ${detail.slice(0, 200)}`,
      );
      if (upstream.status === 400 && detail.includes("messages")) {
        return c.json(
          {
            error: "thread_too_long",
            detail:
              "This conversation is too long to continue. Start a new conversation.",
          },
          413,
        );
      }
      return c.json({ error: "failed", detail: "Agent failed upstream." }, 502);
    }

    const streamId = threadId ?? id;
    const body = streamId
      ? agentStreamStore.start(streamId, messages, upstream.body, {
          onComplete: ({ cancelled, inputMessages }) => {
            void drainQueuedTurn(streamId, inputMessages, cancelled).catch(
              (err) => log.error(`Queued Remix turn failed: ${err}`),
            );
          },
        })
      : upstream.body;

    return new Response(body, {
      headers: {
        "Content-Type":
          upstream.headers.get("Content-Type") ?? "text/event-stream",
        "Cache-Control": "no-cache",
        "x-vercel-ai-ui-message-stream": "v1",
      },
    });
  })
  .get("/activity", (c) => c.json(activitySnapshot()))
  .get(
    "/activity/stream",
    () =>
      new Response(activityEventStream(), {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      }),
  )
  .get("/:threadId/queue", (c) => {
    const threadId = c.req.param("threadId");
    if (!threadIdSchema.safeParse(threadId).success)
      return c.json({ error: "invalid_thread" }, 400);
    return c.json(queueSnapshot(threadId));
  })
  .post("/:threadId/queue", zValidator("json", queueMessageSchema), (c) => {
    const threadId = c.req.param("threadId");
    if (!threadIdSchema.safeParse(threadId).success)
      return c.json({ error: "invalid_thread" }, 400);
    // A queue is a follow-up to a live canonical turn. Refuse orphaned items
    // instead of letting a local restart silently strand a user's message.
    if (!agentStreamStore.isActive(threadId))
      return c.json({ error: "no_active_turn" }, 409);
    const { text, context } = c.req.valid("json");
    const item = agentMessageQueue.enqueue(threadId, {
      text,
      ...(context ? { context } : {}),
    });
    return c.json({ item, ...queueSnapshot(threadId) }, 201);
  })
  .patch(
    "/:threadId/queue/:id",
    zValidator("json", queueMessageSchema.pick({ text: true })),
    (c) => {
      const threadId = c.req.param("threadId");
      if (!threadIdSchema.safeParse(threadId).success)
        return c.json({ error: "invalid_thread" }, 400);
      const item = agentMessageQueue.update(
        threadId,
        c.req.param("id"),
        c.req.valid("json").text,
      );
      if (!item) return c.json({ error: "queue_item_not_found" }, 404);
      return c.json({ item, ...queueSnapshot(threadId) });
    },
  )
  .delete("/:threadId/queue/:id", (c) => {
    const threadId = c.req.param("threadId");
    if (!threadIdSchema.safeParse(threadId).success)
      return c.json({ error: "invalid_thread" }, 400);
    const item = agentMessageQueue.remove(threadId, c.req.param("id"));
    if (!item) return c.json({ error: "queue_item_not_found" }, 404);
    return c.json(queueSnapshot(threadId));
  })
  .post("/:threadId/queue/:id/steer", async (c) => {
    const threadId = c.req.param("threadId");
    if (!threadIdSchema.safeParse(threadId).success)
      return c.json({ error: "invalid_thread" }, 400);
    const item = agentMessageQueue.prioritize(threadId, c.req.param("id"));
    if (!item) return c.json({ error: "queue_item_not_found" }, 404);
    const interrupted = agentStreamStore.cancel(threadId);
    if (!interrupted) {
      // A previous automatic attempt may have lost only the brief Cloud
      // persistence race. Treat an explicit Steer click as a safe retry from
      // the canonical persisted thread rather than stranding the message.
      void drainQueuedTurn(threadId, [], false).catch((err) =>
        log.error(`Steered Remix turn failed: ${err}`),
      );
    }
    return c.json({ item, interrupted, ...queueSnapshot(threadId) });
  })
  // AI SDK's `resume: true` transport reconnects here. This is a local
  // observer of the server-owned upstream stream, not a second Cloud turn.
  .get("/:threadId/stream", (c) => {
    const threadId = c.req.param("threadId");
    if (!threadIdSchema.safeParse(threadId).success)
      return c.json({ error: "invalid_thread" }, 400);
    const stream = agentStreamStore.connect(threadId);
    if (!stream) return c.body(null, 204);
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "x-vercel-ai-ui-message-stream": "v1",
      },
    });
  })
  // Durable turns are an opt-in protocol. This narrow proxy lets the renderer
  // observe, claim, and complete a cloud-paused action without ever receiving
  // the Cloud bearer token or a direct Durable Object binding.
  .get("/thread/:threadId", async (c) => {
    const threadId = c.req.param("threadId");
    if (!threadIdSchema.safeParse(threadId).success)
      return c.json({ error: "invalid_thread" }, 400);
    let upstream: Response;
    try {
      upstream = await fetchCloudThreadSnapshot(threadId);
    } catch (err) {
      if (err instanceof Error && err.message === "cloud_auth_required")
        return c.json({ error: "cloud_auth_required" }, 401);
      log.error(`Durable thread snapshot failed: ${err}`);
      return c.json({ error: "cloud_unreachable" }, 502);
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("Content-Type") ?? "application/json",
      },
    });
  })
  .get("/thread/:threadId/runs", async (c) => {
    const threadId = c.req.param("threadId");
    if (!threadIdSchema.safeParse(threadId).success)
      return c.json({ error: "invalid_thread" }, 400);
    const token = getSessionToken();
    if (!token) return c.json({ error: "cloud_auth_required" }, 401);
    let upstream: Response;
    try {
      upstream = await fetch(
        `${freestyleCloudUrl()}/v2/threads/${encodeURIComponent(threadId)}/runs`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(15_000),
        },
      );
    } catch (err) {
      log.error(`Durable run history failed: ${err}`);
      return c.json({ error: "cloud_unreachable" }, 502);
    }
    if (upstream.status === 401) invalidateSession();
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("Content-Type") ?? "application/json",
      },
    });
  })
  .get("/turn/:turnId/events", async (c) => {
    const turnId = c.req.param("turnId");
    if (!z.string().uuid().safeParse(turnId).success)
      return c.json({ error: "invalid_turn" }, 400);
    const token = getSessionToken();
    if (!token) return c.json({ error: "cloud_auth_required" }, 401);
    let upstream: Response;
    try {
      upstream = await fetch(
        `${freestyleCloudUrl()}/v2/turns/${encodeURIComponent(turnId)}/events`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(15_000),
        },
      );
    } catch (err) {
      log.error(`Durable turn timeline failed: ${err}`);
      return c.json({ error: "cloud_unreachable" }, 502);
    }
    if (upstream.status === 401) invalidateSession();
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("Content-Type") ?? "application/json",
      },
    });
  })
  .post("/turn/:turnId/commands", async (c) => {
    const turnId = c.req.param("turnId");
    if (!z.string().uuid().safeParse(turnId).success)
      return c.json({ error: "invalid_turn" }, 400);
    const token = getSessionToken();
    if (!token) return c.json({ error: "cloud_auth_required" }, 401);
    let upstream: Response;
    try {
      upstream = await fetch(
        `${freestyleCloudUrl()}/v2/turns/${encodeURIComponent(turnId)}/commands`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: await c.req.text(),
          // The command is durable after Cloud accepts it. The renderer may
          // close without cancelling the server-owned turn.
          signal: AbortSignal.timeout(15_000),
        },
      );
    } catch (err) {
      log.error(`Durable turn command failed: ${err}`);
      return c.json({ error: "cloud_unreachable" }, 502);
    }
    if (upstream.status === 401) invalidateSession();
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("Content-Type") ?? "application/json",
      },
    });
  });

export default agentRoute;
