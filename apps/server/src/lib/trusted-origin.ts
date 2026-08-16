import type { MiddlewareHandler } from "hono";

export function isTrustedRendererOrigin(origin: string | undefined): boolean {
  if (!origin) return true;
  if (origin.startsWith("app://")) return true;
  try {
    const url = new URL(origin);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1")
    );
  } catch {
    return false;
  }
}

/**
 * Reads are default-deny for cross-origin browsers, not prefix-listed. This
 * server binds loopback while the user browses the web, so any page they visit
 * can reach it; an allowlist of "sensitive" prefixes silently stops protecting
 * anything the moment a route is renamed. Requests carrying no Origin (the
 * desktop's own fetches, curl, native clients) still pass — only a browser
 * sends Origin on a cross-origin request.
 */
export const trustedOriginMiddleware: MiddlewareHandler = async (c, next) => {
  if (
    c.req.method !== "OPTIONS" &&
    !isTrustedRendererOrigin(c.req.header("origin"))
  ) {
    return c.json({ error: "Forbidden" }, 403);
  }
  return next();
};
