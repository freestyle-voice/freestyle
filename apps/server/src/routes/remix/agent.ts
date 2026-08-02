import { createAppLogger } from "@freestyle-voice/utils";
import { remixAgentRequestSchema } from "@freestyle-voice/validations";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import {
  FREESTYLE_CLOUD_PROVIDER_ID,
  freestyleCloudUrl,
} from "../../lib/freestyle-cloud.js";
import { getDefaultModels } from "../../lib/providers.js";
import { runRemixAgentLocally } from "../../lib/remix-agent.js";
import { getSessionToken, invalidateSession } from "../../lib/sessions.js";
import { isCleanupModelSupported } from "../models.js";

const log = createAppLogger("remix-agent");

/**
 * One agent turn. On Freestyle Cloud the loop runs on the Worker and this
 * route is a streaming proxy — the renderer never holds the cloud token, so
 * the Bearer header is injected here from the server-side session. On BYOK
 * the same loop runs in-process.
 */
const agentRoute = new Hono().post(
  "/",
  zValidator("json", remixAgentRequestSchema),
  async (c) => {
    const body = c.req.valid("json");
    const llm = getDefaultModels().llm;
    if (!llm) {
      return c.json(
        {
          error: "no-model",
          detail: "No AI model is set up yet. Pick one in Settings > Models.",
        },
        400,
      );
    }

    if (llm.provider === FREESTYLE_CLOUD_PROVIDER_ID) {
      const token = getSessionToken();
      if (!token) return c.json({ error: "cloud_auth_required" }, 401);

      let upstream: Response;
      try {
        upstream = await fetch(`${freestyleCloudUrl()}/v2/remix`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            messages: body.messages,
            context: body.context,
          }),
          signal: c.req.raw.signal,
        });
      } catch (err) {
        log.error(`Remix cloud request failed: ${err}`);
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
          `Remix cloud returned ${upstream.status}: ${detail.slice(0, 200)}`,
        );
        return c.json(
          { error: "failed", detail: "Remix failed upstream." },
          502,
        );
      }

      // The UI message stream passes through byte-for-byte.
      return new Response(upstream.body, {
        headers: {
          "Content-Type":
            upstream.headers.get("Content-Type") ?? "text/event-stream",
          "Cache-Control": "no-cache",
          "x-vercel-ai-ui-message-stream": "v1",
        },
      });
    }

    if (!(await isCleanupModelSupported(llm.provider, llm.model_id))) {
      return c.json(
        {
          error: "unsupported-model",
          detail: `${llm.model_id} can't run Remix. Pick a different model in Settings > Models.`,
        },
        400,
      );
    }

    try {
      return await runRemixAgentLocally(body, llm, c.req.raw.signal);
    } catch (err) {
      log.error(`Remix agent (BYOK) failed: ${err}`);
      return c.json(
        {
          error: "failed",
          detail: err instanceof Error ? err.message : "Remix failed.",
        },
        502,
      );
    }
  },
);

export default agentRoute;
