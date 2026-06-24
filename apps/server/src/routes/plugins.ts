import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import { PLUGIN_CATALOG } from "../lib/plugins/catalog.js";
import { reloadServerPlugins } from "../lib/plugins/index.js";
import {
  installServerPlugin,
  uninstallServerPlugin,
} from "../lib/plugins/install-service.js";

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
  });

export default plugins;
