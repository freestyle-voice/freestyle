import { createAppLogger } from "@freestyle-voice/utils";
import { Hono } from "hono";
import {
  DeviceFlowError,
  fetchCloudUser,
  freestyleCloudUrl,
  pollDeviceToken,
  pushLocalCleanupPreferences,
  requestDeviceCode,
  signOutCloud,
} from "../lib/freestyle-cloud.js";
import { applyFreestyleCloudDefaults } from "../lib/freestyle-cloud-defaults.js";
import { capture, identifyCloudUser } from "../lib/posthog.js";
import {
  getSession,
  getSessionUser,
  invalidateSession,
  setSession,
} from "../lib/sessions.js";
import { isTrustedRendererOrigin } from "../lib/trusted-origin.js";

const log = createAppLogger("auth");

const auth = new Hono()
  .use("*", async (c, next) => {
    if (!isTrustedRendererOrigin(c.req.header("origin"))) {
      return c.json({ error: "Forbidden" }, 403);
    }
    return next();
  })
  .get("/status", (c) => {
    const user = getSessionUser();
    return c.json({ authenticated: !!user, user });
  })
  .post("/device/code", async (c) => {
    const code = await requestDeviceCode();
    return c.json(code);
  })
  .post("/device/token", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      device_code?: unknown;
    } | null;
    if (!body || typeof body.device_code !== "string") {
      return c.json({ error: "device_code required" }, 400);
    }

    try {
      const token = await pollDeviceToken(body.device_code);
      const user = await fetchCloudUser(token.access_token);
      const now = Date.now();
      setSession({
        token: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt: token.expires_in ? now + token.expires_in * 1000 : null,
        issuedAt: token.expires_in ? now : null,
        user,
        host: freestyleCloudUrl(),
      });
      applyFreestyleCloudDefaults();
      identifyCloudUser(user);
      capture("freestyle_default_applied_on_signin", {
        voice: true,
        cleanup: true,
      });
      // Push any cleanup preferences configured while signed out so the cloud
      // post-processor picks them up immediately, without waiting for an edit.
      void pushLocalCleanupPreferences(token.access_token).catch((err) => {
        log.warn(
          `cleanup preference sync after sign-in failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
      return c.json({ authenticated: true, user });
    } catch (err) {
      if (err instanceof DeviceFlowError) {
        if (err.code === "authorization_pending") {
          return c.json({ error: err.code }, 202);
        }
        if (err.code === "slow_down") return c.json({ error: err.code }, 429);
        if (err.code === "access_denied")
          return c.json({ error: err.code }, 403);
        if (err.code === "expired_token")
          return c.json({ error: err.code }, 410);
        if (err.code === "invalid_grant")
          return c.json({ error: err.code }, 400);
      }
      throw err;
    }
  })
  .post("/sign-out", async (c) => {
    const session = getSession();
    if (session) {
      await signOutCloud(session.token).catch(() => {});
    }
    invalidateSession();
    return c.json({ ok: true });
  });

export default auth;
