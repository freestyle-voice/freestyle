import {
  localLlmConfigSchema,
  normalizeOpenApiCompatibleEndpoint,
  settingValueSchema,
} from "@freestyle/validations";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { getDb } from "../lib/db.js";
import { applyMlxAsrRetentionPolicy } from "../lib/mlx-asr/server.js";
import {
  buildOpenApiCompatibleHeaders,
  canUseManualOpenApiCompatibleModelSelection,
  getOpenApiCompatibleManualModelHint,
} from "../lib/openapi-compatible.js";
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
      const endpoint = normalizeOpenApiCompatibleEndpoint(body.url);
      if (!endpoint) {
        return c.json(
          {
            error:
              "Use https, or http only for localhost, and provide a base ending in /v1 or a full /responses or /chat/completions URL.",
          },
          400,
        );
      }
      const apiKey = body.api_key?.trim() || undefined;

      try {
        const res = await fetch(`${endpoint}/models`, {
          headers: buildOpenApiCompatibleHeaders(endpoint, apiKey),
          signal: AbortSignal.timeout(5000),
        });

        if (!res.ok) {
          if (canUseManualOpenApiCompatibleModelSelection(res.status)) {
            return c.json({
              ok: true,
              models: [],
              model_discovery: "manual",
              hint: getOpenApiCompatibleManualModelHint(endpoint),
            });
          }

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

        if (models.length === 0) {
          return c.json({
            ok: true,
            models: [],
            model_discovery: "manual",
            hint: getOpenApiCompatibleManualModelHint(endpoint),
          });
        }

        return c.json({ ok: true, models, model_discovery: "available" });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to connect";
        return c.json({ error: message }, 502);
      }
    },
  );

export default settings;
