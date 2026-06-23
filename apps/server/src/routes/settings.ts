import {
  cleanupCustomPromptSchema,
  cleanupIntensitySchema,
  localLlmConfigSchema,
  pluginsSettingSchema,
  settingValueSchema,
} from "@freestyle/validations";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { getDb } from "../lib/db.js";
import { applyMlxAsrRetentionPolicy } from "../lib/mlx-asr/server.js";
import { capture } from "../lib/posthog.js";

const settings = new Hono()
  .get("/", (c) => {
    const db = getDb();
    const rows = db.prepare("SELECT key, value FROM settings").all() as {
      key: string;
      value: string;
    }[];

    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return c.json(result);
  })
  .get("/:key", (c) => {
    const db = getDb();
    const key = c.req.param("key");
    const row = db
      .prepare("SELECT value FROM settings WHERE key = ?")
      .get(key) as { value: string } | undefined;

    if (!row) {
      return c.json({ error: "Setting not found" }, 404);
    }
    return c.json({ key, value: row.value });
  })
  .put("/:key", zValidator("json", settingValueSchema), async (c) => {
    const db = getDb();
    const key = c.req.param("key");
    const body = c.req.valid("json");

    // Key-specific validation for settings with constrained value shapes.
    if (key === "cleanup_intensity") {
      const parsed = cleanupIntensitySchema.safeParse(body.value);
      if (!parsed.success) {
        return c.json({ error: "Invalid cleanup intensity" }, 400);
      }
    } else if (key === "cleanup_custom_prompt") {
      const parsed = cleanupCustomPromptSchema.safeParse(body.value);
      if (!parsed.success) {
        return c.json({ error: "Custom prompt is too long" }, 400);
      }
    } else if (key === "plugins") {
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(body.value);
      } catch {
        return c.json({ error: "Invalid plugins setting" }, 400);
      }
      const parsed = pluginsSettingSchema.safeParse(parsedJson);
      if (!parsed.success) {
        return c.json({ error: "Invalid plugins setting" }, 400);
      }
    }

    db.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    ).run(key, String(body.value));

    if (key === "mlx_asr_keep_alive_minutes") {
      applyMlxAsrRetentionPolicy();
    }

    // Don't capture internal/system keys
    const skipKeys = new Set(["posthog_device_id", "telemetry_enabled"]);
    if (!skipKeys.has(key)) {
      capture("setting updated", { key });
    }

    return c.json({ key, value: body.value });
  })
  .delete("/:key", (c) => {
    const db = getDb();
    const key = c.req.param("key");
    db.prepare("DELETE FROM settings WHERE key = ?").run(key);
    return c.json({ ok: true });
  })
  .post(
    "/local-llm/test",
    zValidator("json", localLlmConfigSchema),
    async (c) => {
      const body = c.req.valid("json");
      const url = body.url.replace(/\/+$/, "").replace(/\/v1$/, "");

      try {
        const res = await fetch(`${url}/v1/models`, {
          headers: {
            ...(body.api_key
              ? { Authorization: `Bearer ${body.api_key}` }
              : {}),
          },
          signal: AbortSignal.timeout(5000),
        });

        if (!res.ok) {
          return c.json(
            { error: `Server returned ${res.status}: ${res.statusText}` },
            502,
          );
        }

        const data = (await res.json()) as {
          data?: { id: string }[];
        };

        let models: string[] = [];
        if (data.data && Array.isArray(data.data)) {
          models = data.data.map((m) => m.id);
        }

        return c.json({ ok: true, models });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to connect";
        return c.json({ error: message }, 502);
      }
    },
  );

export default settings;
