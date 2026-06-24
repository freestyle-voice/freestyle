import {
  createDictionarySchema,
  exportSchema,
  updateDictionarySchema,
} from "@freestyle-voice/validations";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { getDb } from "../lib/db.js";

interface DictionaryRow {
  id: number;
  key: string;
  value: string;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

const dictionary = new Hono()
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

    let rows: DictionaryRow[];
    let countRow: { count: number };

    if (search) {
      const pattern = `%${search}%`;
      rows = db
        .prepare(
          `SELECT * FROM dictionary WHERE key LIKE ? OR value LIKE ? ORDER BY ${orderColumn} ${orderDir} LIMIT ? OFFSET ?`,
        )
        .all(pattern, pattern, limit, offset) as unknown as DictionaryRow[];

      countRow = db
        .prepare(
          "SELECT COUNT(*) as count FROM dictionary WHERE key LIKE ? OR value LIKE ?",
        )
        .get(pattern, pattern) as { count: number };
    } else {
      rows = db
        .prepare(
          `SELECT * FROM dictionary ORDER BY ${orderColumn} ${orderDir} LIMIT ? OFFSET ?`,
        )
        .all(limit, offset) as unknown as DictionaryRow[];

      countRow = db
        .prepare("SELECT COUNT(*) as count FROM dictionary")
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
      .prepare("SELECT key, value FROM dictionary ORDER BY length(key) DESC")
      .all() as { key: string; value: string }[];
    return c.json(rows);
  })
  .get("/:id", (c) => {
    const db = getDb();
    const id = Number(c.req.param("id"));
    const row = db.prepare("SELECT * FROM dictionary WHERE id = ?").get(id) as
      | DictionaryRow
      | undefined;

    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json(row);
  })
  .post("/", zValidator("json", createDictionarySchema), async (c) => {
    const db = getDb();
    const body = c.req.valid("json");

    try {
      const result = db
        .prepare(`INSERT INTO dictionary (key, value) VALUES (?, ?)`)
        .run(body.key.trim().toLowerCase(), body.value.trim());

      return c.json(
        {
          id: result.lastInsertRowid,
          key: body.key.trim().toLowerCase(),
          value: body.value.trim(),
        },
        201,
      );
    } catch {
      return c.json(
        { error: "A dictionary entry with this key already exists" },
        409,
      );
    }
  })
  .put("/:id", zValidator("json", updateDictionarySchema), async (c) => {
    const db = getDb();
    const id = Number(c.req.param("id"));
    const body = c.req.valid("json");

    const existing = db
      .prepare("SELECT * FROM dictionary WHERE id = ?")
      .get(id) as DictionaryRow | undefined;
    if (!existing) return c.json({ error: "Not found" }, 404);

    const newKey = body.key?.trim().toLowerCase() ?? existing.key;
    const newValue = body.value?.trim() ?? existing.value;

    try {
      db.prepare(
        `UPDATE dictionary SET key = ?, value = ?, updated_at = datetime('now') WHERE id = ?`,
      ).run(newKey, newValue, id);

      return c.json({ id, key: newKey, value: newValue });
    } catch {
      return c.json(
        { error: "A dictionary entry with this key already exists" },
        409,
      );
    }
  })
  .delete("/:id", (c) => {
    const db = getDb();
    const id = Number(c.req.param("id"));
    db.prepare("DELETE FROM dictionary WHERE id = ?").run(id);
    return c.json({ ok: true });
  })
  .post("/export", zValidator("json", exportSchema), (c) => {
    const { type } = c.req.valid("json");
    const db = getDb();
    const rows = db
      .prepare("SELECT key, value FROM dictionary ORDER BY key ASC")
      .all() as { key: string; value: string }[];

    switch (type) {
      case "json":
        return c.json(rows);
      default:
        return c.json({ error: `Unsupported export type: ${type}` }, 400);
    }
  })
  .post("/import", async (c) => {
    const db = getDb();
    const body = await c.req.json<{ key: string; value: string }[]>();

    if (!Array.isArray(body)) {
      return c.json(
        { error: "Expected a JSON array of {key, value} objects" },
        400,
      );
    }

    let imported = 0;
    let skipped = 0;
    const insertStmt = db.prepare(
      "INSERT OR IGNORE INTO dictionary (key, value) VALUES (?, ?)",
    );

    for (const entry of body) {
      if (entry.key?.trim() && entry.value?.trim()) {
        const result = insertStmt.run(
          entry.key.trim().toLowerCase(),
          entry.value.trim(),
        );
        if (result.changes > 0) imported++;
        else skipped++;
      } else {
        skipped++;
      }
    }

    return c.json({ imported, skipped });
  });

export default dictionary;
