import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod";
import {
  freestyleConfigSchema,
  getConfig,
  getFlag,
  setFlag,
  updateConfig,
} from "../lib/config.js";

const flagValueSchema = z.object({ value: z.boolean() });

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
  .put("/flags/:key", zValidator("json", flagValueSchema), (c) => {
    const key = c.req.param("key");
    const { value } = c.req.valid("json");
    setFlag(key, value);
    return c.json({ ok: true });
  });

export default config;
