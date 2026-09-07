import { remixAgentRequestSchema } from "@freestyle-voice/validations";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod/v3";
import { trustedDesktopAgentFields } from "../lib/agent-request.js";
import { freestyleCloudUrl } from "../lib/freestyle-cloud.js";
import {
  deferRemixCancel,
  deferRemixRequestCancel,
  flushRemixCancels,
} from "../lib/remix-cancel-outbox.js";
import {
  enqueueRemixMessage,
  pauseRemixQueue,
  registerRemixTurn,
  remixQueueSnapshot,
  removeRemixQueuedMessage,
  settleRemixTurn,
  steerRemixQueuedMessage,
  updateRemixQueuedMessage,
} from "../lib/remix-durable-queue.js";
import {
  getSession,
  getSessionToken,
  invalidateSession,
} from "../lib/sessions.js";

const submitSchema = remixAgentRequestSchema.extend({
  threadId: z.string().min(1).max(100),
  clientRequestId: z.string().min(8).max(160),
});
const turnParam = z.object({ turnId: z.string().uuid() });
const threadParam = z.object({ threadId: z.string().min(1).max(100) });
const queueInput = z.object({
  text: z.string().trim().min(1).max(10_000),
  context: remixAgentRequestSchema.shape.context.optional(),
});
const commandSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("cancel"),
    threadId: z.string().min(1).max(100).optional(),
  }),
  z.object({
    type: z.literal("desktop_claim"),
    actionId: z.string().uuid(),
    clientId: z.string().min(8).max(160),
  }),
  z.object({
    type: z.literal("desktop_complete"),
    actionId: z.string().uuid(),
    clientId: z.string().min(8).max(160),
    result: z.unknown(),
  }),
  z.object({
    type: z.literal("retry_desktop"),
    actionId: z.string().uuid(),
    clientRequestId: z.string().min(8).max(160),
  }),
]);

async function proxy(path: string, body?: unknown): Promise<Response> {
  const session = getSession();
  const token = getSessionToken();
  if (!token || !session)
    return Response.json({ error: "cloud_auth_required" }, { status: 401 });
  try {
    const response = await fetch(`${freestyleCloudUrl()}/v2/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      // The receipt is independent of the renderer's observer lifetime.
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await response.text();
    const current = getSession();
    if (current?.host !== session.host || current?.user.id !== session.user.id)
      return Response.json({ error: "remix_account_changed" }, { status: 401 });
    if (response.status === 401) invalidateSession();
    return new Response(payload, {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("content-type") ?? "application/json",
      },
    });
  } catch {
    return Response.json({ error: "remix_unavailable" }, { status: 502 });
  }
}

export const remixDurableRoute = new Hono()
  .use("*", async (c, next) => {
    if (!getSessionToken())
      return c.json({ error: "cloud_auth_required" }, 401);
    await next();
  })
  .get("/:threadId/queue", zValidator("param", threadParam), (c) =>
    c.json(remixQueueSnapshot(c.req.valid("param").threadId)),
  )
  .post(
    "/:threadId/queue",
    zValidator("param", threadParam),
    zValidator("json", queueInput),
    (c) =>
      c.json(
        enqueueRemixMessage(c.req.valid("param").threadId, c.req.valid("json")),
        201,
      ),
  )
  .patch(
    "/:threadId/queue/:id",
    zValidator("json", queueInput.pick({ text: true })),
    (c) =>
      updateRemixQueuedMessage(
        c.req.param("threadId"),
        c.req.param("id"),
        c.req.valid("json").text,
      )
        ? c.json(remixQueueSnapshot(c.req.param("threadId")))
        : c.json({ error: "queue_item_unavailable" }, 409),
  )
  .delete("/:threadId/queue/:id", (c) =>
    removeRemixQueuedMessage(c.req.param("threadId"), c.req.param("id"))
      ? c.json(remixQueueSnapshot(c.req.param("threadId")))
      : c.json({ error: "queue_item_unavailable" }, 409),
  )
  .post("/:threadId/queue/:id/steer", (c) =>
    steerRemixQueuedMessage(c.req.param("threadId"), c.req.param("id"))
      ? c.json(remixQueueSnapshot(c.req.param("threadId")))
      : c.json({ error: "queue_item_unavailable" }, 409),
  )
  .post(
    "/cancel",
    zValidator("json", z.object({ request: submitSchema })),
    (c) => {
      if (!getSessionToken())
        return c.json({ error: "cloud_auth_required" }, 401);
      pauseRemixQueue(c.req.valid("json").request.threadId);
      deferRemixRequestCancel({
        ...c.req.valid("json").request,
        ...trustedDesktopAgentFields(),
      });
      void flushRemixCancels();
      return c.json({ receipt: { cancelQueued: true } }, 202);
    },
  )
  .post("/turns", zValidator("json", submitSchema), async (c) => {
    const response = await proxy("remix/turns", {
      ...c.req.valid("json"),
      ...trustedDesktopAgentFields(),
    });
    if (response.ok) {
      const receipt = (await response.clone().json()) as {
        turn: { id: string };
      };
      registerRemixTurn(c.req.valid("json").threadId, receipt.turn.id);
    }
    return response;
  })
  .get("/turns/:turnId", zValidator("param", turnParam), async (c) => {
    const response = await proxy(`remix/turns/${c.req.valid("param").turnId}`);
    if (response.ok) {
      const receipt = (await response.clone().json()) as {
        turn: { id: string; status: string };
      };
      settleRemixTurn(receipt.turn.id, receipt.turn.status);
    }
    return response;
  })
  .get("/turns/:turnId/events", zValidator("param", turnParam), (c) =>
    proxy(`remix/turns/${c.req.valid("param").turnId}/events`),
  )
  .post(
    "/turns/:turnId/commands",
    zValidator("param", turnParam),
    zValidator("json", commandSchema),
    (c) => {
      const command = c.req.valid("json");
      const { turnId } = c.req.valid("param");
      if (command.type !== "cancel")
        return proxy(`remix/turns/${turnId}/commands`, command);
      if (!getSessionToken())
        return c.json({ error: "cloud_auth_required" }, 401);
      if (command.threadId) {
        const queuedTurn = pauseRemixQueue(command.threadId);
        if (queuedTurn && queuedTurn !== turnId) deferRemixCancel(queuedTurn);
      }
      deferRemixCancel(turnId);
      void flushRemixCancels();
      return c.json({ receipt: { cancelQueued: true } }, 202);
    },
  )
  .get(
    "/thread/:threadId",
    zValidator("param", z.object({ threadId: z.string().min(1).max(100) })),
    (c) => {
      void flushRemixCancels();
      return proxy(
        `threads/${encodeURIComponent(c.req.valid("param").threadId)}`,
      );
    },
  );
