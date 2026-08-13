import {
  caCertPathSettingSchema,
  cleanupAppAssignmentsSchema,
  cleanupCustomPromptSchema,
  cleanupEmailToneSchema,
  cleanupIntensitySchema,
  cleanupOverallToneSchema,
  cleanupPersonalToneSchema,
  cleanupWorkToneSchema,
  disabledPluginsSettingSchema,
  historyRetentionDaysSettingSchema,
  pluginsSettingSchema,
  proxyUrlSettingSchema,
  settingValueSchema,
} from "@freestyle-voice/validations";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { getDb } from "../lib/db.js";
import {
  HISTORY_RETENTION_SETTING_KEY,
  purgeExpiredHistory,
} from "../lib/history-store.js";
import {
  CA_CERT_PATH_SETTING,
  configureNetwork,
  PROXY_URL_SETTING,
} from "../lib/network.js";
import { capture, invalidateTelemetrySetting } from "../lib/posthog.js";
import {
  pushSettingToCloud,
  SYNCED_SETTING_KEYS,
} from "../lib/preferences-sync.js";

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
    } else if (key === "cleanup_personal_tone") {
      const parsed = cleanupPersonalToneSchema.safeParse(body.value);
      if (!parsed.success) {
        return c.json({ error: "Invalid personal tone" }, 400);
      }
    } else if (key === "cleanup_work_tone") {
      const parsed = cleanupWorkToneSchema.safeParse(body.value);
      if (!parsed.success) {
        return c.json({ error: "Invalid work tone" }, 400);
      }
    } else if (key === "cleanup_email_tone") {
      const parsed = cleanupEmailToneSchema.safeParse(body.value);
      if (!parsed.success) {
        return c.json({ error: "Invalid email tone" }, 400);
      }
    } else if (key === "cleanup_overall_tone") {
      const parsed = cleanupOverallToneSchema.safeParse(body.value);
      if (!parsed.success) {
        return c.json({ error: "Invalid overall tone" }, 400);
      }
    } else if (key === "cleanup_app_assignments") {
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(body.value);
      } catch {
        return c.json({ error: "Invalid app assignments setting" }, 400);
      }
      const parsed = cleanupAppAssignmentsSchema.safeParse(parsedJson);
      if (!parsed.success) {
        return c.json({ error: "Invalid app assignments setting" }, 400);
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
    } else if (key === "disabled_plugins") {
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(body.value);
      } catch {
        return c.json({ error: "Invalid disabled_plugins setting" }, 400);
      }
      const parsed = disabledPluginsSettingSchema.safeParse(parsedJson);
      if (!parsed.success) {
        return c.json({ error: "Invalid disabled_plugins setting" }, 400);
      }
    } else if (key === PROXY_URL_SETTING) {
      const parsed = proxyUrlSettingSchema.safeParse(body.value);
      if (!parsed.success) {
        return c.json(
          { error: parsed.error.issues[0]?.message ?? "Invalid proxy URL" },
          400,
        );
      }
    } else if (key === CA_CERT_PATH_SETTING) {
      const parsed = caCertPathSettingSchema.safeParse(body.value);
      if (!parsed.success) {
        return c.json({ error: "Invalid CA certificate path" }, 400);
      }
    } else if (key === HISTORY_RETENTION_SETTING_KEY) {
      const parsed = historyRetentionDaysSettingSchema.safeParse(body.value);
      if (!parsed.success) {
        return c.json(
          {
            error:
              parsed.error.issues[0]?.message ?? "Invalid history retention",
          },
          400,
        );
      }
    }

    db.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    ).run(key, String(body.value));

    // Mirror synced cleanup preferences up to Freestyle Cloud via the durable
    // outbox (enqueues + flushes immediately, retries on failure), so a failed
    // sync never affects the local write or the response.
    if (SYNCED_SETTING_KEYS.has(key)) {
      pushSettingToCloud(key, String(body.value));
    }

    if (key === HISTORY_RETENTION_SETTING_KEY) {
      purgeExpiredHistory();
    }
    // Re-install the global dispatcher so proxy/CA changes take effect for the
    // next download without an app restart.
    if (key === PROXY_URL_SETTING || key === CA_CERT_PATH_SETTING) {
      configureNetwork();
    }

    // Don't capture internal/system keys
    const skipKeys = new Set(["posthog_device_id", "telemetry_enabled"]);
    if (key === "telemetry_enabled") {
      invalidateTelemetrySetting();
    }
    if (!skipKeys.has(key)) {
      capture("setting updated", { key });
    }

    return c.json({ key, value: body.value });
  })
  .delete("/:key", (c) => {
    const db = getDb();
    const key = c.req.param("key");
    db.prepare("DELETE FROM settings WHERE key = ?").run(key);
    if (key === "telemetry_enabled") {
      invalidateTelemetrySetting();
    }
    // Deleting the proxy/CA key must also reset the global dispatcher, mirroring
    // the PUT path — otherwise a stale proxy/CA lingers until the next restart.
    if (key === PROXY_URL_SETTING || key === CA_CERT_PATH_SETTING) {
      configureNetwork();
    }
    return c.json({ ok: true });
  });

export default settings;
