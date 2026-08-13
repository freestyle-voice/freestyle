import { createAppLogger } from "@freestyle-voice/utils";
import { Hono } from "hono";
import { freestyleCloudUrl } from "../lib/freestyle-cloud.js";
import { getSessionToken, invalidateSession } from "../lib/sessions.js";

const log = createAppLogger("connectors-proxy");

/**
 * The desktop renderer speaks only to its local Freestyle server. This proxy
 * adds the server-owned Cloud bearer token, preserving the boundary that keeps
 * provider tokens, callback state, and Cloud credentials out of Electron.
 */
const connectors = new Hono().all("/*", async (c) => {
  const token = getSessionToken();
  if (!token) return c.json({ error: "cloud_auth_required" }, 401);

  const requestUrl = new URL(c.req.url);
  const suffix = requestUrl.pathname.replace(/^\/api\/connectors/, "");
  const upstreamUrl = `${freestyleCloudUrl()}/v2/connectors${suffix}${requestUrl.search}`;
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
      `Connector cloud request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return c.json({ error: "connected_apps_unavailable" }, 502);
  }
});

export default connectors;
