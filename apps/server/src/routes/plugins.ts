import { readFile } from "node:fs/promises";
import path from "node:path";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import * as semver from "semver";
import { z } from "zod";
import { deleteSetting, readSetting, writeSetting } from "../lib/db.js";
import { PLUGIN_CATALOG } from "../lib/plugins/catalog.js";
import { reloadServerPlugins } from "../lib/plugins/index.js";
import {
  installServerPlugin,
  uninstallServerPlugin,
} from "../lib/plugins/install-service.js";
import { resolvePackage } from "../lib/plugins/installer.js";
import {
  discoverPlugins,
  resolvePluginAsset,
  serializePlugins,
} from "../lib/plugins/ui-assets.js";

const STORAGE_PREFIX = "plugin:";

function storageKey(name: string, key: string): string {
  return `${STORAGE_PREFIX}${name}:${key}`;
}

/**
 * Content-Security-Policy for served plugin UI pages. Plugins run same-origin
 * with the loopback server now, so `'self'` covers their own assets and API
 * calls. This is set server-side because a plugin's own `<meta>` CSP is
 * untrustworthy. Font CDNs are allowed to match what the shipped UIs use.
 */
const PLUGIN_UI_CSP =
  "default-src 'self'; " +
  "script-src 'self'; " +
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
  "font-src 'self' https://fonts.gstatic.com; " +
  "img-src 'self' data: https:; " +
  "connect-src 'self'";

const MIME_BY_EXT: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".avif": "image/avif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".map": "application/json; charset=utf-8",
};

function mimeForPath(filePath: string): string {
  return MIME_BY_EXT[path.extname(filePath).toLowerCase()] ?? "text/plain";
}

/**
 * Plugin lifecycle endpoints. The `plugins` / `disabled_plugins` settings are
 * server-owned, but the server's hook registry is loaded once at boot — so when
 * a client (e.g. the desktop app) enables/disables or installs a plugin, it
 * must ask the server to reload so the change takes effect on the server side
 * too, not just in the client's own process.
 */
const installSchema = z.object({
  npmName: z.string().min(1),
  version: z.string().min(1).optional(),
});

const uninstallSchema = z.object({
  specifier: z.string().min(1),
});

const checkUpdatesSchema = z.object({
  plugins: z.array(
    z.object({
      name: z.string().min(1),
      currentVersion: z.string().min(1),
    }),
  ),
});

const plugins = new Hono()
  .post("/reload", async (c) => {
    await reloadServerPlugins();
    return c.json({ ok: true });
  })
  // The discovered plugin list for the hub (name, slug, pages, icon, version,
  // description, readme, enabled, missing). The renderer fetches this directly
  // instead of the old `plugins:list` Electron IPC.
  .get("/", (c) => {
    return c.json({ plugins: serializePlugins(discoverPlugins()) });
  })
  .get("/catalog", (c) => {
    return c.json({ plugins: PLUGIN_CATALOG });
  })
  // Serve a plugin's UI assets from its package dir, path-traversal guarded.
  // Replaces the Electron `freestyle-plugin://<slug>/<asset>` custom scheme:
  // pages now load same-origin from the loopback server, so their bridge can
  // fetch the API directly without the old IPC proxy.
  .get("/:slug/ui/*", async (c) => {
    const slug = c.req.param("slug");
    const assetPath = c.req.path.split(`/${slug}/ui/`)[1] ?? "";
    let resolved: string | null;
    try {
      resolved = resolvePluginAsset(discoverPlugins(), slug, assetPath);
    } catch {
      // A malformed percent-escape makes decodeURIComponent throw; treat it as
      // an unresolvable asset rather than a 500.
      resolved = null;
    }
    if (!resolved) return c.text("Not found", 404);

    let body: Buffer;
    try {
      body = await readFile(resolved);
    } catch {
      return c.text("Not found", 404);
    }
    c.header("Content-Type", mimeForPath(resolved));
    c.header("Content-Security-Policy", PLUGIN_UI_CSP);
    return c.body(
      body.buffer.slice(
        body.byteOffset,
        body.byteOffset + body.byteLength,
      ) as ArrayBuffer,
    );
  })
  .post("/install", zValidator("json", installSchema), async (c) => {
    const { npmName, version } = c.req.valid("json");
    try {
      const installed = await installServerPlugin(npmName, version);
      return c.json({ ok: true, installed });
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : "install failed" },
        502,
      );
    }
  })
  .post("/uninstall", zValidator("json", uninstallSchema), async (c) => {
    const { specifier } = c.req.valid("json");
    try {
      await uninstallServerPlugin(specifier);
      return c.json({ ok: true });
    } catch (err) {
      return c.json(
        { error: err instanceof Error ? err.message : "uninstall failed" },
        500,
      );
    }
  })
  .post("/check-updates", zValidator("json", checkUpdatesSchema), async (c) => {
    const { plugins: entries } = c.req.valid("json");
    const results = await Promise.allSettled(
      entries.map(async (entry) => {
        const resolved = await resolvePackage(entry.name);
        const updateAvailable =
          !!semver.valid(entry.currentVersion) &&
          !!semver.valid(resolved.version) &&
          semver.lt(entry.currentVersion, resolved.version);
        return {
          name: entry.name,
          latestVersion: resolved.version,
          updateAvailable,
        };
      }),
    );
    return c.json({
      updates: results.map((r, i) =>
        r.status === "fulfilled"
          ? r.value
          : {
              name: entries[i].name,
              latestVersion: entries[i].currentVersion,
              updateAvailable: false,
            },
      ),
    });
  })
  // Storage reachable from a plugin's own UI page (via the existing bridge
  // proxy), complementing the read/write `PluginStorage` already available to
  // hook code in `setup()`. Same `plugin:<name>:<key>` namespace, so a page and
  // its hooks share state.
  .get("/:name/storage/:key", (c) => {
    const { name, key } = c.req.param();
    const raw = readSetting(storageKey(name, key));
    if (raw === undefined) return c.json({ value: null });
    try {
      return c.json({ value: JSON.parse(raw) });
    } catch {
      return c.json({ value: null });
    }
  })
  .put(
    "/:name/storage/:key",
    zValidator("json", z.object({ value: z.unknown() })),
    (c) => {
      const { name, key } = c.req.param();
      const { value } = c.req.valid("json");
      writeSetting(storageKey(name, key), JSON.stringify(value));
      return c.json({ ok: true });
    },
  )
  .delete("/:name/storage/:key", (c) => {
    const { name, key } = c.req.param();
    deleteSetting(storageKey(name, key));
    return c.json({ ok: true });
  });

export default plugins;
