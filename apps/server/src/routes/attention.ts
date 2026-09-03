import { createAppLogger } from "@freestyle-voice/utils";
import { Hono } from "hono";
import { cachedCloudJson } from "../lib/cloud-cache.js";
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
    const payload = await cachedCloudJson({
      resource: "attention",
      id: "current",
      maxAgeMs: 60_000,
      load: async () => {
        const upstream = await fetch(`${freestyleCloudUrl()}/v2/attention`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (upstream.status === 401) {
          invalidateSession();
          throw new Error("cloud_auth_required");
        }
        if (!upstream.ok) throw new Error(`attention-${upstream.status}`);
        return (await upstream.json()) as object;
      },
    });
    return c.json(payload);
  } catch (error) {
    if (error instanceof Error && error.message === "cloud_auth_required") {
      return c.json({ error: "cloud_auth_required" }, 401);
    }
    log.debug(
      `Attention cloud request failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return c.json({ error: "attention_unavailable" }, 502);
  }
});

export default attention;
