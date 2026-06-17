import type { MiddlewareHandler } from "hono";
import { bearerAuth } from "hono/bearer-auth";
import { timingSafeEqual } from "hono/utils/buffer";

// The active bearer token. Empty means auth is disabled (the default), which
// keeps the loopback/in-process Electron server open as before. A value is
// set by startServer({ token }) for standalone/remote deployments.
let authToken = "";

export function setAuthToken(token: string | undefined): void {
  authToken = token?.trim() ?? "";
}

export function getAuthToken(): string {
  return authToken;
}

// Liveness endpoint stays open so Docker/health probes work without a token.
const EXEMPT_PATHS = new Set(["/api/health"]);

/**
 * Enforces bearer-token auth when a token is configured. No-op otherwise.
 *
 * - `/api/health` is always exempt (liveness probes).
 * - WebSocket upgrades (e.g. `/stream`) authenticate via a `?token=` query
 *   param, since browsers can't set the `Authorization` header on a socket.
 * - Everything else uses Hono's builtin bearerAuth (`Authorization: Bearer`).
 */
export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const token = getAuthToken();
  if (!token) return next();
  if (EXEMPT_PATHS.has(c.req.path)) return next();

  if (c.req.header("upgrade")?.toLowerCase() === "websocket") {
    // Constant-time compare, matching what bearerAuth does for the HTTP path.
    if (await timingSafeEqual(c.req.query("token") ?? "", token)) return next();
    return c.json({ error: "Unauthorized" }, 401);
  }

  return bearerAuth({ token })(c, next);
};
