import type { MiddlewareHandler } from "hono";
import { callerPluginSlug } from "./plugins/ui-assets.js";

/**
 * Requests that originate from a plugin UI page (identified by a forge-resistant
 * `Referer` slug — see {@link callerPluginSlug}) are same-origin with the
 * loopback server and would otherwise inherit the first-party renderer's full
 * API authority. That would let any plugin page read API keys, auth state,
 * history, and settings, or reach another plugin's routes.
 *
 * This guard confines plugin-originated requests to the plugin subtree:
 *   - anything under `/api/plugins/...` — its own UI assets and storage, plus
 *     routes contributed by plugin middleware. Cross-plugin *storage* access is
 *     separately blocked in the storage routes (per-plugin `:name` scoping);
 *   - `/api/health`.
 * Everything else (keys, auth, settings, history, transcribe, …) — the
 * privileged first-party API — is denied.
 *
 * First-party renderer / tooling requests carry no plugin `Referer` and pass
 * through untouched — their trust is handled by `trustedOriginMiddleware`.
 */
export const pluginApiGuard: MiddlewareHandler = async (c, next) => {
  const slug = callerPluginSlug(c.req.header("referer"));
  if (!slug) return next();

  const path = c.req.path;
  if (path.startsWith("/api/plugins/") || path === "/api/health") {
    return next();
  }

  return c.json(
    { error: "plugin pages may only access the plugin API namespace" },
    403,
  );
};
