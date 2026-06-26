import { createAppLogger } from "@freestyle-voice/utils";
import type { Plugin } from "freestyle-voice";
import type { MiddlewareHandler } from "hono";
import { readSetting } from "../../db.js";
import { syncCleanupPreferences } from "../../freestyle-cloud.js";
import { getSessionToken } from "../../sessions.js";

const log = createAppLogger("cloud-sync");

/**
 * Mutation routes whose successful writes should trigger a background sync to
 * Freestyle Cloud. The middleware runs after the handler (via `await next()`),
 * inspects the response status, and fires a best-effort sync when the user is
 * signed in.
 */
const SYNC_ROUTES: Record<string, Set<string>> = {
  // Settings that affect cloud state.
  "/api/settings/cleanup_intensity": new Set(["PUT"]),
  "/api/settings/cleanup_custom_prompt": new Set(["PUT"]),
};

/**
 * Check if a request path + method pair should trigger a cloud sync.
 * Matches fully resolved paths (Hono resolves `:key` before middleware sees it).
 */
function shouldSync(path: string, method: string): string | null {
  for (const [route, methods] of Object.entries(SYNC_ROUTES)) {
    if (path === route && methods.has(method)) return route;
  }
  return null;
}

/**
 * Best-effort sync of cleanup preferences to Freestyle Cloud. Swallows all
 * errors — failures never interrupt the response pipeline.
 */
function syncCleanup(): void {
  try {
    const token = getSessionToken();
    if (!token) return;
    const intensity = readSetting("cleanup_intensity") ?? "low";
    const customPrompt = readSetting("cleanup_custom_prompt");
    void syncCleanupPreferences({ token, intensity, customPrompt }).catch(
      (err) => {
        log.warn(
          `cloud sync failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      },
    );
  } catch {
    // Swallow — never interrupt the pipeline.
  }
}

const cloudSyncMiddleware: MiddlewareHandler = async (c, next) => {
  await next();

  // Only sync on successful mutations.
  if (c.res.status >= 200 && c.res.status < 300) {
    const route = shouldSync(c.req.path, c.req.method);
    if (route) {
      syncCleanup();
    }
  }
};

/**
 * Built-in Freestyle Cloud sync plugin. Watches for successful mutations on
 * data routes (settings, dictionary, vocabulary, formats) and pushes changes
 * to Freestyle Cloud in the background when the user is signed in.
 *
 * Uses `enforce: "post"` so it runs after all other middleware (including auth)
 * and after the route handler has committed the write to SQLite.
 */
export function cloudSyncPlugin(): Plugin {
  return {
    name: "freestyle:cloud-sync",
    enforce: "post",
    middleware: [cloudSyncMiddleware],
  };
}
