import type { Plugin } from "freestyle-voice";
import { authMiddleware, setAuthToken } from "../../auth.js";

/**
 * Built-in auth plugin. Contributes bearer-token authentication as middleware
 * with `enforce: "pre"` so it runs before any user-supplied plugin middleware.
 *
 * Always present, never disable-able. When no token is configured the
 * middleware is a transparent no-op (appropriate for loopback Electron).
 */
export function authPlugin(token?: string): Plugin {
  return {
    name: "freestyle:auth",
    enforce: "pre",
    setup() {
      setAuthToken(token);
    },
    middleware: [authMiddleware],
  };
}
