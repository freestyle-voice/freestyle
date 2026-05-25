import { Hono } from "hono";
import { getDb } from "../lib/db.js";

interface HistoryRow {
  id: number;
  raw_text: string;
  cleaned_text: string | null;
  voice_provider: string;
  voice_model: string;
  llm_provider: string | null;
  llm_model: string | null;
  duration_ms: number;
  audio_duration_ms: number;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  created_at: string;
}

const ALLOWED_ORDER_COLUMNS = new Set([
  "created_at",
  "duration_ms",
  "cost_usd",
]);

const history = new Hono()
  .get("/", (c) => {
    const db = getDb();
    const limit = Math.min(Number(c.req.query("limit") || 50), 200);
    const offset = Number(c.req.query("offset") || 0);
    const search = c.req.query("search")?.trim() || "";
    const orderByParam = c.req.query("orderBy") || "-created_at";

    // Parse orderBy: "-created_at" means DESC, "created_at" means ASC
    const desc = orderByParam.startsWith("-");
    const column = desc ? orderByParam.slice(1) : orderByParam;
    const orderColumn = ALLOWED_ORDER_COLUMNS.has(column)
      ? column
      : "created_at";
    const orderDir = desc ? "DESC" : "ASC";

    let rows: HistoryRow[];
    let countRow: { count: number };

    if (search) {
      const pattern = `%${search}%`;
      rows = db
        .prepare(
          `SELECT * FROM transcription_history WHERE raw_text LIKE ? OR cleaned_text LIKE ? OR voice_model LIKE ? ORDER BY ${orderColumn} ${orderDir} LIMIT ? OFFSET ?`,
        )
        .all(
          pattern,
          pattern,
          pattern,
          limit,
          offset,
        ) as unknown as HistoryRow[];

      countRow = db
        .prepare(
          `SELECT COUNT(*) as count FROM transcription_history WHERE raw_text LIKE ? OR cleaned_text LIKE ? OR voice_model LIKE ?`,
        )
        .get(pattern, pattern, pattern) as { count: number };
    } else {
      rows = db
        .prepare(
          `SELECT * FROM transcription_history ORDER BY ${orderColumn} ${orderDir} LIMIT ? OFFSET ?`,
        )
        .all(limit, offset) as unknown as HistoryRow[];

      countRow = db
        .prepare("SELECT COUNT(*) as count FROM transcription_history")
        .get() as { count: number };
    }

    return c.json({
      items: rows,
      total: countRow.count,
      limit,
      offset,
    });
  })
  .get("/stats", (c) => {
    const db = getDb();

    const stats = db
      .prepare(
        `SELECT
          COUNT(*) as total_sessions,
          COALESCE(SUM(duration_ms), 0) as total_duration_ms,
          COALESCE(SUM(input_tokens), 0) as total_input_tokens,
          COALESCE(SUM(output_tokens), 0) as total_output_tokens,
          COALESCE(SUM(cost_usd), 0) as total_cost_usd,
          COALESCE(AVG(duration_ms), 0) as avg_duration_ms
        FROM transcription_history`,
      )
      .get() as {
      total_sessions: number;
      total_duration_ms: number;
      total_input_tokens: number;
      total_output_tokens: number;
      total_cost_usd: number;
      avg_duration_ms: number;
    };

    // Use localtime to match the user's timezone for "today" boundary
    const today = db
      .prepare(
        `SELECT COUNT(*) as sessions, COALESCE(SUM(cost_usd), 0) as cost
         FROM transcription_history
         WHERE date(created_at, 'localtime') = date('now', 'localtime')`,
      )
      .get() as { sessions: number; cost: number };

    return c.json({
      ...stats,
      today_sessions: today.sessions,
      today_cost: today.cost,
    });
  })
  .get("/:id", (c) => {
    const db = getDb();
    const id = Number(c.req.param("id"));
    const row = db
      .prepare("SELECT * FROM transcription_history WHERE id = ?")
      .get(id) as HistoryRow | undefined;

    if (!row) return c.json({ error: "Not found" }, 404);
    return c.json(row);
  })
  .delete("/:id", (c) => {
    const db = getDb();
    const id = Number(c.req.param("id"));
    db.prepare("DELETE FROM transcription_history WHERE id = ?").run(id);
    return c.json({ ok: true });
  })
  .delete("/", (c) => {
    const db = getDb();
    db.exec("DELETE FROM transcription_history");
    return c.json({ ok: true });
  });

export default history;
