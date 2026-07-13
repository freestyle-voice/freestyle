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

const STORAGE_PREFIX = "plugin:";

function storageKey(name: string, key: string): string {
  return `${STORAGE_PREFIX}${name}:${key}`;
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
  .get("/catalog", (c) => {
    return c.json({ plugins: PLUGIN_CATALOG });
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
