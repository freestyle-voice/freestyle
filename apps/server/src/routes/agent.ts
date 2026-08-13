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
 * One companion agent turn. The loop runs on the Worker (`/v2/agent`) and
 * this route is a streaming proxy — the renderer never holds the cloud
 * token, so the Bearer header is injected here from the server-side session.
 */
const agentRoute = new Hono().post(
  "/",
  zValidator("json", agentRequestSchema),
  async (c) => {
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
  },
);

export default agentRoute;
