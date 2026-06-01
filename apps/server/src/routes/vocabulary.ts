import {
  createVocabularySchema,
  importVocabularySchema,
  updateVocabularySchema,
} from "@freestyle/validations";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { getDb } from "../lib/db.js";
import type { VocabularyRow } from "../lib/vocabulary.js";

const vocabulary = new Hono()
  .get("/", (c) => {
    const db = getDb();
    const limit = Math.min(Number(c.req.query("limit") || 50), 200);
    const offset = Number(c.req.query("offset") || 0);
    const search = c.req.query("search")?.trim() || "";
    const orderByParam = c.req.query("orderBy") || "-created_at";

    const desc = orderByParam.startsWith("-");
    const column = desc ? orderByParam.slice(1) : orderByParam;
    const allowedColumns = new Set(["created_at", "updated_at", "term"]);
    const orderColumn = allowedColumns.has(column) ? column : "created_at";
    const orderDir = desc ? "DESC" : "ASC";

    let rows: VocabularyRow[];
    let countRow: { count: number };

    if (search) {
      const pattern = `%${search}%`;
      rows = db
        .prepare(
          `SELECT * FROM vocabulary WHERE term LIKE ? OR notes LIKE ? ORDER BY ${orderColumn} ${orderDir} LIMIT ? OFFSET ?`,
        )
        .all(pattern, pattern, limit, offset) as unknown as VocabularyRow[];

      countRow = db
        .prepare(
          "SELECT COUNT(*) as count FROM vocabulary WHERE term LIKE ? OR notes LIKE ?",
        )
        .get(pattern, pattern) as { count: number };
    } else {
      rows = db
        .prepare(
          `SELECT * FROM vocabulary ORDER BY ${orderColumn} ${orderDir} LIMIT ? OFFSET ?`,
        )
        .all(limit, offset) as unknown as VocabularyRow[];

      countRow = db
        .prepare("SELECT COUNT(*) as count FROM vocabulary")
        .get() as { count: number };
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
      .prepare("SELECT term FROM vocabulary ORDER BY length(term) DESC")
      .all() as { term: string }[];
    return c.json(rows.map((r) => r.term));
  })
  .get("/export/json", (c) => {
    const db = getDb();
    const rows = db
      .prepare("SELECT term, notes FROM vocabulary ORDER BY term ASC")
      .all() as { term: string; notes: string | null }[];
    return c.json(rows);
  })
  .get("/:id", (c) => {
    const db = getDb();
    const id = Number(c.req.param("id"));
    const row = db.prepare("SELECT * FROM vocabulary WHERE id = ?").get(id) as
      | VocabularyRow
      | undefined;

    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json(row);
  })
  .post("/", zValidator("json", createVocabularySchema), async (c) => {
    const db = getDb();
    const body = c.req.valid("json");
    const term = body.term.trim();
    const notes = body.notes?.trim() || null;

    try {
      const result = db
        .prepare(`INSERT INTO vocabulary (term, notes) VALUES (?, ?)`)
        .run(term, notes);

      return c.json(
        {
          id: result.lastInsertRowid,
          term,
          notes,
        },
        201,
      );
    } catch {
      return c.json(
        { error: "A vocabulary entry with this term already exists" },
        409,
      );
    }
  })
  .put("/:id", zValidator("json", updateVocabularySchema), async (c) => {
    const db = getDb();
    const id = Number(c.req.param("id"));
    const body = c.req.valid("json");

    const existing = db
      .prepare("SELECT * FROM vocabulary WHERE id = ?")
      .get(id) as VocabularyRow | undefined;
    if (!existing) return c.json({ error: "Not found" }, 404);

    const newTerm = body.term?.trim() ?? existing.term;
    const newNotes =
      body.notes !== undefined ? body.notes.trim() || null : existing.notes;

    try {
      db.prepare(
        `UPDATE vocabulary SET term = ?, notes = ?, updated_at = datetime('now') WHERE id = ?`,
      ).run(newTerm, newNotes, id);

      return c.json({ id, term: newTerm, notes: newNotes });
    } catch {
      return c.json(
        { error: "A vocabulary entry with this term already exists" },
        409,
      );
    }
  })
  .delete("/:id", (c) => {
    const db = getDb();
    const id = Number(c.req.param("id"));
    db.prepare("DELETE FROM vocabulary WHERE id = ?").run(id);
    return c.json({ ok: true });
  })
  .post("/import", zValidator("json", importVocabularySchema), async (c) => {
    const db = getDb();
    const body = c.req.valid("json");

    let imported = 0;
    let skipped = 0;
    const insertStmt = db.prepare(
      "INSERT OR IGNORE INTO vocabulary (term, notes) VALUES (?, ?)",
    );

    db.exec("BEGIN");
    try {
      for (const entry of body) {
        const term = entry.term.trim();
        if (!term) {
          skipped++;
          continue;
        }
        const result = insertStmt.run(term, entry.notes?.trim() || null);
        if (result.changes > 0) {
          imported++;
        } else {
          skipped++;
        }
      }
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }

    return c.json({ imported, skipped });
  });

export default vocabulary;
