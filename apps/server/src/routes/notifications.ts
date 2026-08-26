import { createAppLogger } from "@freestyle-voice/utils";
import { Hono } from "hono";
import {
  FreestyleCloudAuthError,
  fetchCourierInboxToken,
} from "../lib/freestyle-cloud.js";
import { getSession, invalidateSession } from "../lib/sessions.js";

const log = createAppLogger("notifications");

/**
 * Renderer-safe Courier authentication proxy. The renderer receives only a
 * one-hour, self-scoped Courier JWT and the stable user id it belongs to; the
 * Freestyle Cloud bearer token remains in the embedded server's SQLite session.
 */
const notificationsRoute = new Hono().post("/token", async (c) => {
  const session = getSession();
  if (!session) {
    return c.json({ ok: false, reason: "cloud_auth_required" as const }, 401);
  }
  try {
    const token = await fetchCourierInboxToken(session.token);
    return c.json({ token, userId: session.user.id });
  } catch (error) {
    if (error instanceof FreestyleCloudAuthError) {
      invalidateSession();
      return c.json({ ok: false, reason: "cloud_auth_required" as const }, 401);
    }
    log.error(
      `Courier notification token failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    return c.json({ ok: false, reason: "cloud_unreachable" as const }, 502);
  }
});

export default notificationsRoute;
