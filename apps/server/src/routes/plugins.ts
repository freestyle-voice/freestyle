import { createAppLogger } from "@freestyle-voice/utils";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import * as semver from "semver";
import { z } from "zod";
import { formatError } from "../lib/format-error.js";
import { freestyleCloudUrl } from "../lib/freestyle-cloud.js";
import { reloadServerPlugins } from "../lib/plugins/index.js";
import {
  installServerPlugin,
  uninstallServerPlugin,
} from "../lib/plugins/install-service.js";
import { resolvePackage } from "../lib/plugins/installer.js";

const log = createAppLogger("plugins");

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
  .get("/catalog", async (c) => {
    // The cloud registry is the sole source of truth for the plugin catalog,
    // so new plugins can be listed without a desktop release.
    try {
      const res = await fetch(`${freestyleCloudUrl()}/plugins`, {
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) {
        return c.json({ error: "Failed to fetch plugin catalog" }, 502);
      }
      return c.json(await res.json());
    } catch (err) {
      log.warn(`failed to fetch plugin catalog: ${formatError(err)}`);
      return c.json({ error: "Failed to fetch plugin catalog" }, 502);
    }
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
  });

export default plugins;
