import {
  deviceTokenSchema,
  linkSocialSchema,
  unlinkAccountSchema,
  updateProfileSchema,
} from "@freestyle-voice/validations";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import {
  DeviceFlowError,
  fetchCloudUser,
  freestyleCloudUrl,
  linkCloudSocial,
  listCloudAccounts,
  pollDeviceToken,
  requestDeviceCode,
  signOutCloud,
  unlinkCloudAccount,
  updateCloudUserName,
} from "../lib/freestyle-cloud.js";
import { applyFreestyleCloudDefaults } from "../lib/freestyle-cloud-defaults.js";
import { capture, identifyCloudUser } from "../lib/posthog.js";
import { validateSession } from "../lib/session-validate.js";
import {
  getSession,
  getSessionToken,
  invalidateSession,
  setSession,
} from "../lib/sessions.js";
import { isTrustedRendererOrigin } from "../lib/trusted-origin.js";

/**
 * Where the browser lands after an OAuth account-link completes. Mirrors the
 * billing flow: a static marketing page, since the desktop can't be redirected
 * back into itself — the app refetches linked accounts when it regains focus.
 */
const LINK_CALLBACK_URL = "https://freestylevoice.com/profile";

const auth = new Hono()
  .use("*", async (c, next) => {
    if (!isTrustedRendererOrigin(c.req.header("origin"))) {
      return c.json({ error: "Forbidden" }, 403);
    }
    return next();
  })
  .get("/status", async (c) => {
    const { user, verified } = await validateSession();
    return c.json({ authenticated: !!user, user, verified });
  })
  .post("/device/code", async (c) => {
    const code = await requestDeviceCode();
    return c.json(code);
  })
  .post("/device/token", zValidator("json", deviceTokenSchema), async (c) => {
    const { device_code } = c.req.valid("json");

    try {
      const token = await pollDeviceToken(device_code);
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
  })
  // Social accounts linked to the signed-in user, for the profile page.
  .get("/accounts", async (c) => {
    const token = getSessionToken();
    if (!token) {
      return c.json({ error: "Not signed in to Freestyle Cloud" }, 401);
    }
    try {
      const accounts = await listCloudAccounts(token);
      return c.json({ accounts });
    } catch {
      return c.json({ error: "Failed to load connected accounts" }, 502);
    }
  })
  // Update the display name, then mirror it into the local session so the
  // sidebar/profile reflect the change without waiting for a status refresh.
  .post("/profile", zValidator("json", updateProfileSchema), async (c) => {
    const session = getSession();
    if (!session) {
      return c.json({ error: "Not signed in to Freestyle Cloud" }, 401);
    }
    const { name } = c.req.valid("json");
    try {
      await updateCloudUserName(session.token, name);
    } catch {
      return c.json({ error: "Failed to update profile" }, 502);
    }
    const user = { ...session.user, name };
    setSession({
      token: session.token,
      refreshToken: session.refreshToken ?? null,
      expiresAt: session.expiresAt ?? null,
      issuedAt: session.issuedAt ?? null,
      user,
      host: session.host,
    });
    identifyCloudUser(user);
    return c.json({ user });
  })
  // Begin linking a social account: returns the provider's OAuth URL for the
  // renderer to open in the system browser.
  .post("/link-social", zValidator("json", linkSocialSchema), async (c) => {
    const token = getSessionToken();
    if (!token) {
      return c.json({ error: "Not signed in to Freestyle Cloud" }, 401);
    }
    const { provider } = c.req.valid("json");
    try {
      const { url } = await linkCloudSocial(token, {
        provider,
        callbackURL: LINK_CALLBACK_URL,
      });
      return c.json({ url });
    } catch {
      return c.json({ error: "Failed to start account linking" }, 502);
    }
  })
  // Unlink a social account from the signed-in user.
  .post(
    "/unlink-account",
    zValidator("json", unlinkAccountSchema),
    async (c) => {
      const token = getSessionToken();
      if (!token) {
        return c.json({ error: "Not signed in to Freestyle Cloud" }, 401);
      }
      const { providerId } = c.req.valid("json");
      try {
        await unlinkCloudAccount(token, providerId);
        return c.json({ ok: true });
      } catch {
        return c.json({ error: "Failed to unlink account" }, 502);
      }
    },
  );

export default auth;
