import { Hono } from "hono";
import {
  freestyleConfigSchema,
  getConfig,
  getFlag,
  setFlag,
  updateConfig,
} from "../lib/config.js";

const config = new Hono()
  /** Full config — the renderer loads this once on mount. */
  .get("/", (c) => {
    return c.json(getConfig());
  })
  /** Replace the full config in one shot. */
  .put("/", async (c) => {
    const body = await c.req.json();
    const parsed = freestyleConfigSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "Invalid config", details: parsed.error.issues },
        400,
      );
    }
    updateConfig(parsed.data);
    return c.json({ ok: true });
  })
  /** Read a single flag. */
  .get("/flags/:key", (c) => {
    const key = c.req.param("key");
    return c.json({ key, value: getFlag(key) });
  })
  /** Set a single flag. */
  .put("/flags/:key", async (c) => {
    const key = c.req.param("key");
    const body = (await c.req.json()) as { value?: boolean };
    if (typeof body.value !== "boolean") {
      return c.json({ error: "value must be a boolean" }, 400);
    }
    setFlag(key, body.value);
    return c.json({ ok: true });
  });

export default config;
