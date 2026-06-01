import {
  createShortcutSchema,
  updateShortcutSchema,
} from "@freestyle/validations";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { getDb } from "../lib/db.js";

interface ShortcutRow {
  id: number;
  key: string;
  value: string;
  action: string;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

const shortcuts = new Hono()
  .get("/", (c) => {
    const db = getDb();
    const limit = Math.min(Number(c.req.query("limit") || 50), 200);
    const offset = Number(c.req.query("offset") || 0);
    const search = c.req.query("search")?.trim() || "";
    const orderByParam = c.req.query("orderBy") || "-created_at";

    const desc = orderByParam.startsWith("-");
    const column = desc ? orderByParam.slice(1) : orderByParam;
    const allowedColumns = new Set(["created_at", "updated_at", "key"]);
    const orderColumn = allowedColumns.has(column) ? column : "created_at";
    const orderDir = desc ? "DESC" : "ASC";

    let rows: ShortcutRow[];
    let countRow: { count: number };

    if (search) {
      const pattern = `%${search}%`;
      rows = db
        .prepare(
          `SELECT * FROM shortcuts WHERE key LIKE ? OR value LIKE ? ORDER BY ${orderColumn} ${orderDir} LIMIT ? OFFSET ?`,
        )
        .all(pattern, pattern, limit, offset) as unknown as ShortcutRow[];

      countRow = db
        .prepare(
          "SELECT COUNT(*) as count FROM shortcuts WHERE key LIKE ? OR value LIKE ?",
        )
        .get(pattern, pattern) as { count: number };
    } else {
      rows = db
        .prepare(
          `SELECT * FROM shortcuts ORDER BY ${orderColumn} ${orderDir} LIMIT ? OFFSET ?`,
        )
        .all(limit, offset) as unknown as ShortcutRow[];

      countRow = db
        .prepare("SELECT COUNT(*) as count FROM shortcuts")
        .get() as unknown as { count: number };
    }

    return c.json({
      items: rows,
      total: countRow.count,
      limit,
      offset,
    });
  })
  .get("/all", (c) => {
    const db = getDb();
    const rows = db
      .prepare(
        "SELECT key, value, action FROM shortcuts ORDER BY length(key) DESC",
      )
      .all() as { key: string; value: string; action: string }[];
    return c.json(rows);
  })
  .get("/:id", (c) => {
    const db = getDb();
    const id = Number(c.req.param("id"));
    const row = db.prepare("SELECT * FROM shortcuts WHERE id = ?").get(id) as
      | ShortcutRow
      | undefined;

    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json(row);
  })
  .post("/", zValidator("json", createShortcutSchema), async (c) => {
    const db = getDb();
    const body = c.req.valid("json");

    try {
      const result = db
        .prepare(`INSERT INTO shortcuts (key, value, action) VALUES (?, ?, ?)`)
        .run(
          body.key.trim().toLowerCase(),
          body.value.trim(),
          body.action ?? "replace",
        );

      return c.json(
        {
          id: result.lastInsertRowid,
          key: body.key.trim().toLowerCase(),
          value: body.value.trim(),
          action: body.action ?? "replace",
        },
        201,
      );
    } catch {
      return c.json(
        { error: "A shortcut with this trigger phrase already exists" },
        409,
      );
    }
  })
  .put("/:id", zValidator("json", updateShortcutSchema), async (c) => {
    const db = getDb();
    const id = Number(c.req.param("id"));
    const body = c.req.valid("json");

    const existing = db
      .prepare("SELECT * FROM shortcuts WHERE id = ?")
      .get(id) as ShortcutRow | undefined;
    if (!existing) return c.json({ error: "Not found" }, 404);

    const newKey = body.key?.trim().toLowerCase() ?? existing.key;
    const newValue = body.value?.trim() ?? existing.value;
    const newAction = body.action ?? existing.action;

    try {
      db.prepare(
        `UPDATE shortcuts SET key = ?, value = ?, action = ?, updated_at = datetime('now') WHERE id = ?`,
      ).run(newKey, newValue, newAction, id);

      return c.json({ id, key: newKey, value: newValue, action: newAction });
    } catch {
      return c.json(
        { error: "A shortcut with this trigger phrase already exists" },
        409,
      );
    }
  })
  .delete("/:id", (c) => {
    const db = getDb();
    const id = Number(c.req.param("id"));
    db.prepare("DELETE FROM shortcuts WHERE id = ?").run(id);
    return c.json({ ok: true });
  })
  .get("/export/json", (c) => {
    const db = getDb();
    const rows = db
      .prepare("SELECT key, value, action FROM shortcuts ORDER BY key ASC")
      .all() as { key: string; value: string; action: string }[];
    return c.json(rows);
  })
  .post("/import", async (c) => {
    const db = getDb();
    const body =
      await c.req.json<{ key: string; value: string; action?: string }[]>();

    if (!Array.isArray(body)) {
      return c.json(
        { error: "Expected a JSON array of {key, value, action?} objects" },
        400,
      );
    }

    let imported = 0;
    let skipped = 0;
    const insertStmt = db.prepare(
      "INSERT OR IGNORE INTO shortcuts (key, value, action) VALUES (?, ?, ?)",
    );

    for (const entry of body) {
      if (entry.key?.trim() && entry.value?.trim()) {
        const result = insertStmt.run(
          entry.key.trim().toLowerCase(),
          entry.value.trim(),
          entry.action ?? "replace",
        );
        if (result.changes > 0) imported++;
        else skipped++;
      } else {
        skipped++;
      }
    }

    return c.json({ imported, skipped });
  });

export default shortcuts;
