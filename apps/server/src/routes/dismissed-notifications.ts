import { notificationKeySchema } from "@freestyle-voice/validations";
import { Hono } from "hono";
import { getDb } from "../lib/db.js";

/**
 * Dismissals for in-app dialogs/banners (changelogs, feature prompts, profile
 * nudges). Presence of a key means the corresponding UI has been dismissed.
 * Not synced to Freestyle Cloud — stored in the local (or configured remote)
 * server's SQLite DB, the same place settings/vocabulary live.
 */
const dismissedNotifications = new Hono()
  .get("/", (c) => {
    const db = getDb();
    const rows = db
      .prepare("SELECT key FROM dismissed_notifications ORDER BY key ASC")
      .all() as { key: string }[];
    return c.json(
      rows.flatMap((row) => {
        const parsed = notificationKeySchema.safeParse(row.key);
        // Rows written by this route are already canonical. Do not normalize a
        // corrupt/manual row here: returning a key different from the stored
        // primary key would make it impossible for DELETE to remove that row.
        return parsed.success && parsed.data === row.key ? [row.key] : [];
      }),
    );
  })
  .put("/:key", (c) => {
    const key = c.req.param("key");
    const parsed = notificationKeySchema.safeParse(key);
    if (!parsed.success) {
      return c.json({ error: "Invalid notification key" }, 400);
    }

    const db = getDb();
    db.prepare(
      `INSERT INTO dismissed_notifications (key) VALUES (?)
       ON CONFLICT(key) DO NOTHING`,
    ).run(parsed.data);

    return c.json({ key: parsed.data, dismissed: true });
  })
  .delete("/:key", (c) => {
    const key = c.req.param("key");
    const parsed = notificationKeySchema.safeParse(key);
    if (!parsed.success) {
      return c.json({ error: "Invalid notification key" }, 400);
    }

    const db = getDb();
    db.prepare("DELETE FROM dismissed_notifications WHERE key = ?").run(
      parsed.data,
    );

    return c.json({ key: parsed.data, dismissed: false });
  });

export default dismissedNotifications;
