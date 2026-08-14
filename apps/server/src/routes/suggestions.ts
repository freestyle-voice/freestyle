import { createAppLogger } from "@freestyle-voice/utils";
import { Hono } from "hono";
import { freestyleCloudUrl } from "../lib/freestyle-cloud.js";
import { getSessionToken, invalidateSession } from "../lib/sessions.js";

const log = createAppLogger("suggestions-proxy");

/**
 * Same shape as the connectors proxy: the renderer speaks only to the local
 * server, which forwards to Cloud with the server-owned bearer token.
 */
const suggestions = new Hono().all("/*", async (c) => {
  const token = getSessionToken();
  if (!token) return c.json({ error: "cloud_auth_required" }, 401);

  const requestUrl = new URL(c.req.url);
  const suffix = requestUrl.pathname.replace(/^\/api\/suggestions/, "");
  const upstreamUrl = `${freestyleCloudUrl()}/v2/suggestions${suffix}${requestUrl.search}`;
  const method = c.req.method;
  try {
    const upstream = await fetch(upstreamUrl, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(method === "GET" || method === "HEAD"
          ? {}
          : {
              "Content-Type":
                c.req.header("content-type") ?? "application/json",
            }),
      },
      ...(method === "GET" || method === "HEAD"
        ? {}
        : { body: await c.req.raw.arrayBuffer() }),
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
    log.error(
      `Suggestions cloud request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return c.json({ error: "suggestions_unavailable" }, 502);
  }
});

export default suggestions;
