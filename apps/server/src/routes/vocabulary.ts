import {
  createVocabularySchema,
  exportSchema,
  importVocabularySchema,
  querySchema,
  updateVocabularySchema,
  vocabularyActionSchema,
} from "@freestyle-voice/validations";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { getDb } from "../lib/db.js";
import { likePattern } from "../lib/like-pattern.js";
import { capture } from "../lib/posthog.js";
import { pushVocabularyToCloud } from "../lib/preferences-sync.js";
import {
  deleteVocabularyByIds,
  exportVocabularyEntries,
  importVocabularyEntries,
  type VocabularyRow,
} from "../lib/vocabulary.js";

const ALLOWED_ORDER_COLUMNS = new Set(["created_at", "updated_at", "term"]);

const vocabulary = new Hono()
  .get("/", zValidator("query", querySchema), (c) => {
    const db = getDb();
    const { limit, offset, search: rawSearch, orderBy } = c.req.valid("query");
    const search = rawSearch?.trim() || "";

    const orderColumn =
      orderBy && ALLOWED_ORDER_COLUMNS.has(orderBy.column)
        ? orderBy.column
        : "created_at";
    // Default ordering (no orderBy param) is newest-first.
    const orderDir = orderBy
      ? orderBy.order === "desc"
        ? "DESC"
        : "ASC"
      : "DESC";

    let rows: VocabularyRow[];
    let countRow: { count: number };

    if (search) {
      const pattern = likePattern(search);
      rows = db
        .prepare(
          `SELECT * FROM vocabulary WHERE term LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\' ORDER BY ${orderColumn} ${orderDir} LIMIT ? OFFSET ?`,
        )
        .all(pattern, pattern, limit, offset) as unknown as VocabularyRow[];

      countRow = db
        .prepare(
          "SELECT COUNT(*) as count FROM vocabulary WHERE term LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\'",
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
  .post("/export", zValidator("json", exportSchema), (c) => {
    const { type } = c.req.valid("json");
    // Only "json" is supported today; the enum guards other values but keep the
    // explicit branch so adding a format is a compile-time reminder here.
    if (type !== "json") {
      return c.json({ error: `Unsupported export type: ${type}` }, 400);
    }
    return c.json(exportVocabularyEntries());
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

      capture("vocabulary term added", { has_notes: notes !== null });

      // Mirror the change up to the cloud (debounced, fire-and-forget).
      pushVocabularyToCloud();

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

      // Mirror the change up to the cloud (debounced, fire-and-forget).
      pushVocabularyToCloud();

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
    capture("vocabulary term deleted", {});

    // Mirror the delete up to the cloud (debounced, fire-and-forget). The cloud
    // replaces its term array wholesale, so the delete propagates and won't be
    // re-seeded on the next pull.
    pushVocabularyToCloud();

    return c.json({ ok: true });
  })
  .post("/import", zValidator("json", importVocabularySchema), (c) => {
    const { imported, skipped } = importVocabularyEntries(c.req.valid("json"));

    capture("vocabulary terms imported", { imported, skipped });

    // Mirror the imported terms up to the cloud (debounced, fire-and-forget).
    if (imported > 0) pushVocabularyToCloud();

    return c.json({ imported, skipped });
  })
  .post("/actions", zValidator("json", vocabularyActionSchema), (c) => {
    const body = c.req.valid("json");

    switch (body.action) {
      case "bulk-delete": {
        const deleted = deleteVocabularyByIds(body.ids);
        if (deleted > 0) {
          capture("vocabulary terms deleted", { count: deleted });
          // One cloud push for the whole batch — the cloud replaces its term
          // array wholesale, so every delete propagates in a single PUT.
          pushVocabularyToCloud();
        }
        return c.json({ deleted });
      }

      case "import": {
        const { imported, skipped } = importVocabularyEntries(body.entries);
        capture("vocabulary terms imported", { imported, skipped });
        if (imported > 0) pushVocabularyToCloud();
        return c.json({ imported, skipped });
      }

      case "export":
        // Only "json" is supported today (the schema enum enforces this).
        return c.json(exportVocabularyEntries());
    }
  });

export default vocabulary;
