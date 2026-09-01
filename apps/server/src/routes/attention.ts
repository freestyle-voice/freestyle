import { createAppLogger } from "@freestyle-voice/utils";
import { Hono } from "hono";
import { freestyleCloudUrl } from "../lib/freestyle-cloud.js";
import { getSessionToken, invalidateSession } from "../lib/sessions.js";

const log = createAppLogger("attention-proxy");

/**
 * A display-only, account-scoped work snapshot. The renderer never receives
 * the Cloud session bearer token, and the proxy intentionally forwards no
 * extra local state or sensitive action payloads.
 */
const attention = new Hono().get("/", async (c) => {
  const token = getSessionToken();
  if (!token) return c.json({ error: "cloud_auth_required" }, 401);

  try {
    const upstream = await fetch(`${freestyleCloudUrl()}/v2/attention`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: c.req.raw.signal,
    });
    if (upstream.status === 401) {
      invalidateSession();
      return c.json({ error: "cloud_auth_required" }, 401);
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("content-type") ?? "application/json",
      },
    });
  } catch (error) {
    log.debug(
      `Attention cloud request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return c.json({ error: "attention_unavailable" }, 502);
  }
});

export default attention;
