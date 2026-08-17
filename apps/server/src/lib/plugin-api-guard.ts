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
 * The plugin pages are the only documents served from the loopback origin
 * (first-party renderers load from `app://` or the dev server), so a
 * `Sec-Fetch-Site: same-origin` request — a header pages cannot forge or drop —
 * also identifies a plugin page even when it suppresses its `Referer`.
 *
 * First-party renderer / tooling requests carry neither and pass through
 * untouched — their trust is handled by `trustedOriginMiddleware`.
 */
export const pluginApiGuard: MiddlewareHandler = async (c, next) => {
  const fromPluginPage =
    callerPluginSlug(c.req.header("referer")) !== null ||
    c.req.header("sec-fetch-site") === "same-origin";
  if (!fromPluginPage) return next();

  const path = c.req.path;
  if (path.startsWith("/api/plugins/") || path === "/api/health") {
    return next();
  }

  return c.json(
    { error: "plugin pages may only access the plugin API namespace" },
    403,
  );
};
