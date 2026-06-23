import { Hono } from "hono";
import {
  fetchCloudUser,
  freestyleCloudUrl,
  pollDeviceToken,
  requestDeviceCode,
  signOutCloud,
} from "../lib/freestyle-cloud.js";
import { revertFreestyleCloudDefaults } from "../lib/freestyle-cloud-defaults.js";
import { identifyCloudUser, resetCloudIdentity } from "../lib/posthog.js";
import {
  clearSession,
  getSession,
  getSessionUser,
  setSession,
} from "../lib/sessions.js";

const auth = new Hono()
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
      identifyCloudUser(user);
      return c.json({ authenticated: true, user });
    } catch (err) {
      if (err instanceof Error && err.name === "authorization_pending") {
        return c.json({ error: "authorization_pending" }, 202);
      }
      if (err instanceof Error && err.name === "slow_down") {
        return c.json({ error: "slow_down" }, 429);
      }
      throw err;
    }
  })
  .post("/sign-out", async (c) => {
    const session = getSession();
    if (session) {
      await signOutCloud(session.token).catch(() => {});
    }
    clearSession();
    resetCloudIdentity();
    revertFreestyleCloudDefaults();
    return c.json({ ok: true });
  });

export default auth;
