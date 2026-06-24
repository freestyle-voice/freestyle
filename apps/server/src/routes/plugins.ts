import { Hono } from "hono";
import { reloadServerPlugins } from "../lib/plugins/index.js";

/**
 * Plugin lifecycle endpoints. The `plugins` / `disabled_plugins` settings are
 * server-owned, but the server's hook registry is loaded once at boot — so when
 * a client (e.g. the desktop app) enables/disables a plugin, it must ask the
 * server to reload so the change takes effect on the server side too, not just
 * in the client's own process.
 */
const plugins = new Hono().post("/reload", async (c) => {
  await reloadServerPlugins();
  return c.json({ ok: true });
});

export default plugins;
