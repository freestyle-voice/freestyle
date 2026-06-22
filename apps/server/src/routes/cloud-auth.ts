import { Hono } from "hono";
import { setCloudAuthToken } from "../lib/cloud-auth.js";

// Loopback-only (the server binds 127.0.0.1). The Electron main process pushes
// the Freestyle Cloud session token here after sign-in / sign-out so the
// freestyle-cloud provider can attach it without a server restart. Send
// `{ token: null }` (or an empty token) to clear it on sign-out.
const cloudAuth = new Hono().put("/", async (c) => {
  const body = (await c.req.json().catch(() => null)) as {
    token?: unknown;
  } | null;
  const token = body && typeof body.token === "string" ? body.token : null;
  setCloudAuthToken(token);
  return c.json({ ok: true });
});

export default cloudAuth;
