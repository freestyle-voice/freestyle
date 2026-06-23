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

export const trustedOriginMiddleware: MiddlewareHandler = async (c, next) => {
  const isMutation = !["GET", "HEAD", "OPTIONS"].includes(c.req.method);
  const isWebSocket = c.req.header("upgrade")?.toLowerCase() === "websocket";
  if (
    (isMutation || isWebSocket) &&
    !isTrustedRendererOrigin(c.req.header("origin"))
  ) {
    return c.json({ error: "Forbidden" }, 403);
  }
  return next();
};
