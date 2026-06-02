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
  description: string | null;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

interface StepRow {
  id: number;
  shortcut_id: number;
  position: number;
  action: string;
  value: string;
}

function getStepsForShortcut(
  db: ReturnType<typeof getDb>,
  shortcutId: number,
): StepRow[] {
  return db
    .prepare(
      "SELECT * FROM shortcut_steps WHERE shortcut_id = ? ORDER BY position ASC",
    )
    .all(shortcutId) as unknown as StepRow[];
}

function insertSteps(
  db: ReturnType<typeof getDb>,
  shortcutId: number,
  steps: { action: string; value?: string }[],
): void {
  const stmt = db.prepare(
    "INSERT INTO shortcut_steps (shortcut_id, position, action, value) VALUES (?, ?, ?, ?)",
  );
  for (let i = 0; i < steps.length; i++) {
    stmt.run(shortcutId, i, steps[i].action, steps[i].value ?? "");
  }
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
          `SELECT * FROM shortcuts WHERE key LIKE ? ORDER BY ${orderColumn} ${orderDir} LIMIT ? OFFSET ?`,
        )
        .all(pattern, limit, offset) as unknown as ShortcutRow[];

      countRow = db
        .prepare("SELECT COUNT(*) as count FROM shortcuts WHERE key LIKE ?")
        .get(pattern) as unknown as { count: number };
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

    const items = rows.map((row) => ({
      ...row,
      steps: getStepsForShortcut(db, row.id),
    }));

    return c.json({
      items,
      total: countRow.count,
      limit,
      offset,
    });
  })
  .get("/all", (c) => {
    const db = getDb();
    const rows = db
      .prepare("SELECT * FROM shortcuts ORDER BY length(key) DESC")
      .all() as unknown as ShortcutRow[];

    const items = rows.map((row) => ({
      ...row,
      steps: getStepsForShortcut(db, row.id),
    }));

    return c.json(items);
  })
  .get("/export/json", (c) => {
    const db = getDb();
    const rows = db
      .prepare("SELECT * FROM shortcuts ORDER BY key ASC")
      .all() as unknown as ShortcutRow[];

    const items = rows.map((row) => ({
      key: row.key,
      description: row.description,
      steps: getStepsForShortcut(db, row.id).map((s) => ({
        action: s.action,
        value: s.value,
      })),
    }));

    return c.json(items);
  })
  .get("/:id", (c) => {
    const db = getDb();
    const id = Number(c.req.param("id"));
    const row = db.prepare("SELECT * FROM shortcuts WHERE id = ?").get(id) as
      | ShortcutRow
      | undefined;

    if (!row) return c.json({ error: "Not found" }, 404);

    return c.json({
      ...row,
      steps: getStepsForShortcut(db, row.id),
    });
  })
  .post("/", zValidator("json", createShortcutSchema), async (c) => {
    const db = getDb();
    const body = c.req.valid("json");
    const key = body.key.trim().toLowerCase();

    try {
      const result = db
        .prepare("INSERT INTO shortcuts (key, description) VALUES (?, ?)")
        .run(key, body.description ?? null);

      const shortcutId = result.lastInsertRowid as number;
      insertSteps(db, shortcutId, body.steps);

      return c.json(
        {
          id: shortcutId,
          key,
          description: body.description ?? null,
          steps: getStepsForShortcut(db, shortcutId),
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
    const newDescription =
      body.description !== undefined ? body.description : existing.description;

    try {
      db.prepare(
        "UPDATE shortcuts SET key = ?, description = ?, updated_at = datetime('now') WHERE id = ?",
      ).run(newKey, newDescription ?? null, id);

      if (body.steps) {
        db.prepare("DELETE FROM shortcut_steps WHERE shortcut_id = ?").run(id);
        insertSteps(db, id, body.steps);
      }

      return c.json({
        id,
        key: newKey,
        description: newDescription,
        steps: getStepsForShortcut(db, id),
      });
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
  .post("/import", async (c) => {
    const db = getDb();
    const body =
      await c.req.json<
        {
          key: string;
          value?: string;
          action?: string;
          description?: string;
          steps?: { action: string; value?: string }[];
        }[]
      >();

    if (!Array.isArray(body)) {
      return c.json(
        { error: "Expected a JSON array of shortcut objects" },
        400,
      );
    }

    let imported = 0;
    let skipped = 0;

    const insertShortcut = db.prepare(
      "INSERT OR IGNORE INTO shortcuts (key, description) VALUES (?, ?)",
    );
    const insertStep = db.prepare(
      "INSERT INTO shortcut_steps (shortcut_id, position, action, value) VALUES (?, ?, ?, ?)",
    );

    for (const entry of body) {
      if (!entry.key?.trim()) {
        skipped++;
        continue;
      }

      const key = entry.key.trim().toLowerCase();
      const description = entry.description ?? null;

      const result = insertShortcut.run(key, description);
      if (result.changes === 0) {
        skipped++;
        continue;
      }

      const shortcutId = result.lastInsertRowid as number;

      if (entry.steps && Array.isArray(entry.steps) && entry.steps.length > 0) {
        for (let i = 0; i < entry.steps.length; i++) {
          insertStep.run(
            shortcutId,
            i,
            entry.steps[i].action,
            entry.steps[i].value ?? "",
          );
        }
      } else if (entry.value) {
        const action = entry.action ?? "replace";
        insertStep.run(shortcutId, 0, action, entry.value);
      } else {
        skipped++;
        db.prepare("DELETE FROM shortcuts WHERE id = ?").run(shortcutId);
        continue;
      }

      imported++;
    }

    return c.json({ imported, skipped });
  });

export default shortcuts;
