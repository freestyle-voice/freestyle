import { createAppLogger } from "@freestyle-voice/utils";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
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
});

/**
 * One Remix workspace agent turn. The loop runs on the Worker (`/v2/agent`)
 * and this route is a streaming proxy — the renderer never holds the cloud
 * token, so the Bearer header is injected here from the server-side session.
 */
const agentRoute = new Hono()
  .post("/", zValidator("json", agentRequestSchema), async (c) => {
    const { messages, firstTurn, id, threadId } = c.req.valid("json");

    const token = getSessionToken();
    if (!token) return c.json({ error: "cloud_auth_required" }, 401);

    let upstream: Response;
    try {
      upstream = await fetch(`${freestyleCloudUrl()}/v2/agent`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messages,
          ...(threadId || id ? { threadId: threadId ?? id } : {}),
          ...(firstTurn ? { firstTurn: true } : {}),
          client: {
            platform: process.platform,
            supportsDownloadsSave: true,
          },
        }),
        signal: c.req.raw.signal,
      });
    } catch (err) {
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

    return new Response(upstream.body, {
      headers: {
        "Content-Type":
          upstream.headers.get("Content-Type") ?? "text/event-stream",
        "Cache-Control": "no-cache",
        "x-vercel-ai-ui-message-stream": "v1",
      },
    });
  })
  // Durable turns are an opt-in protocol. This narrow proxy lets the renderer
  // observe, claim, and complete a cloud-paused action without ever receiving
  // the Cloud bearer token or a direct Durable Object binding.
  .get("/thread/:threadId", async (c) => {
    const threadId = c.req.param("threadId");
    if (!z.string().min(1).max(100).safeParse(threadId).success)
      return c.json({ error: "invalid_thread" }, 400);
    const token = getSessionToken();
    if (!token) return c.json({ error: "cloud_auth_required" }, 401);
    let upstream: Response;
    try {
      upstream = await fetch(
        `${freestyleCloudUrl()}/v2/threads/${encodeURIComponent(threadId)}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(15_000),
        },
      );
    } catch (err) {
      log.error(`Durable thread snapshot failed: ${err}`);
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
