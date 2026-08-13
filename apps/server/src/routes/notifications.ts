import { createAppLogger } from "@freestyle-voice/utils";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { freestyleCloudUrl } from "../lib/freestyle-cloud.js";
import { drainNotificationOutbox } from "../lib/notifications/outbox.js";
import * as store from "../lib/notifications/store.js";
import { notificationTransport } from "../lib/notifications/transport.js";
import { getSessionToken, invalidateSession } from "../lib/sessions.js";

const log = createAppLogger("notifications");

const createSchema = z.object({
  kind: z.enum(["thread", "info"]).default("thread"),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(4_000),
  threadId: z.string().min(1).max(200).optional(),
  url: z.string().url().max(2_000).optional(),
});

const seenSchema = z.object({ ids: z.array(z.string().min(1)).max(100) });

async function forwardHistory(): Promise<{ status: number; payload: unknown }> {
  const token = getSessionToken();
  if (!token)
    return {
      status: 401,
      payload: { ok: false, reason: "cloud_auth_required" },
    };
  try {
    const upstream = await fetch(
      `${freestyleCloudUrl()}/v2/notifications/history`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (upstream.status === 401) {
      invalidateSession();
      return {
        status: 401,
        payload: { ok: false, reason: "cloud_auth_required" },
      };
    }
    return { status: upstream.status, payload: await upstream.json() };
  } catch (err) {
    log.error(`Notification history failed: ${err}`);
    return { status: 502, payload: { ok: false, reason: "cloud-unreachable" } };
  }
}

const notificationsRoute = new Hono()
  .get("/", (c) => c.json({ notifications: store.listActive() }))
  .get("/history", async (c) => {
    const local = store
      .listActive()
      .filter((n) => n.origin === "local")
      .map((n) => ({
        id: n.id,
        origin: "local" as const,
        kind: n.kind,
        title: n.title,
        body: n.body,
        createdAt: n.createdAt,
        expiresAt: n.expiresAt,
        dismissedAt: null,
        openedAt: null,
      }));
    const { status, payload } = await forwardHistory();
    if (status !== 200) {
      return c.json(
        local.length > 0 ? { notifications: local } : (payload as object),
        (local.length > 0 ? 200 : status) as 200,
      );
    }
    const cloud =
      (payload as { notifications?: unknown[] }).notifications ?? [];
    const merged = [
      ...local,
      ...cloud.map((row) => ({ ...(row as object), origin: "cloud" as const })),
    ].sort(
      (a, b) =>
        (b as { createdAt: number }).createdAt -
        (a as { createdAt: number }).createdAt,
    );
    return c.json({ notifications: merged });
  })
  .post("/", zValidator("json", createSchema), (c) => {
    const input = c.req.valid("json");
    const record = store.createLocal({
      kind: input.kind,
      title: input.title,
      body: input.body,
      threadId: input.threadId ?? null,
      payload: input.url ? { url: input.url } : null,
    });
    return c.json({ ok: true, notification: record });
  })
  .post("/refresh", (c) => {
    notificationTransport.refreshNow();
    void drainNotificationOutbox();
    return c.json({ ok: true });
  })
  .post("/seen", zValidator("json", seenSchema), (c) => {
    store.markSeen(c.req.valid("json").ids);
    return c.json({ ok: true });
  })
  .post("/:id/dismiss", (c) => {
    const ok = store.dismiss(c.req.param("id"));
    void drainNotificationOutbox();
    return c.json({ ok });
  })
  .post("/:id/open", (c) => {
    const result = store.open(c.req.param("id"));
    void drainNotificationOutbox();
    return c.json(result);
  });

export default notificationsRoute;
