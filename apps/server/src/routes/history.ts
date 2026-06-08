import { Hono } from "hono";
import { getDb } from "../lib/db.js";
import { capture } from "../lib/posthog.js";

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

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const history = new Hono()
  .get("/", (c) => {
    const db = getDb();
    const limit = Math.min(Number(c.req.query("limit") || 50), 200);
    const offset = Number(c.req.query("offset") || 0);
    const search = c.req.query("search")?.trim() || "";
    const start_date_param = c.req.query("start_date");
    const end_date_param = c.req.query("end_date");
    const start_date =
      start_date_param && DATE_REGEX.test(start_date_param)
        ? start_date_param
        : null;
    const end_date =
      end_date_param && DATE_REGEX.test(end_date_param) ? end_date_param : null;
    const orderByParam = c.req.query("orderBy") || "-created_at";

    // Parse orderBy: "-created_at" means DESC, "created_at" means ASC
    const desc = orderByParam.startsWith("-");
    const column = desc ? orderByParam.slice(1) : orderByParam;
    const orderColumn = ALLOWED_ORDER_COLUMNS.has(column)
      ? column
      : "created_at";
    const orderDir = desc ? "DESC" : "ASC";

    // Dynamically build WHERE conditions
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (search) {
      const pattern = `%${search}%`;
      conditions.push(
        "(raw_text LIKE ? OR cleaned_text LIKE ? OR voice_model LIKE ?)",
      );
      params.push(pattern, pattern, pattern);
    }

    if (start_date) {
      conditions.push("date(created_at,'localtime') >= ? ");
      params.push(start_date);
    }

    if (end_date) {
      conditions.push("date(created_at,'localtime') <= ? ");
      params.push(end_date);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    // Query rows
    const rowsQuery = `SELECT * FROM transcription_history ${whereClause} ORDER BY ${orderColumn} ${orderDir} LIMIT ? OFFSET ?`;
    const rows = db
      .prepare(rowsQuery)
      .all(...params, limit, offset) as unknown as HistoryRow[];

    // Query total count
    const countQuery = `SELECT COUNT(*) as count FROM transcription_history ${whereClause}`;
    const countRow = db.prepare(countQuery).get(...params) as { count: number };

    return c.json({
      items: rows,
      total: countRow.count,
      limit,
      offset,
    });
  })
  .get("/stats", (c) => {
    const db = getDb();

    const startDateParam = c.req.query("start_date");
    const endDateParam = c.req.query("end_date");
    const startDate =
      startDateParam && DATE_REGEX.test(startDateParam) ? startDateParam : null;
    const endDate =
      endDateParam && DATE_REGEX.test(endDateParam) ? endDateParam : null;

    const conditions: string[] = [];
    const params: string[] = [];

    if (startDate) {
      conditions.push("date(created_at, 'localtime') >= ?");
      params.push(startDate);
    }
    if (endDate) {
      conditions.push("date(created_at, 'localtime') <= ?");
      params.push(endDate);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const statsQuery = `
        SELECT
          COUNT(*) as total_sessions,
          COALESCE(SUM(duration_ms), 0) as total_duration_ms,
          COALESCE(SUM(input_tokens), 0) as total_input_tokens,
          COALESCE(SUM(output_tokens), 0) as total_output_tokens,
          COALESCE(SUM(cost_usd), 0) as total_cost_usd,
          COALESCE(AVG(duration_ms), 0) as avg_duration_ms,
          COALESCE(SUM(
            CASE
              WHEN length(trim(COALESCE(cleaned_text, raw_text))) = 0 THEN 0
              ELSE length(trim(COALESCE(cleaned_text, raw_text)))
                - length(replace(trim(COALESCE(cleaned_text, raw_text)), ' ', ''))
                + 1
            END
          ), 0) as total_words
        FROM transcription_history
        ${whereClause}
        `;

    const stats = db.prepare(statsQuery).get(...params) as {
      total_sessions: number;
      total_duration_ms: number;
      total_input_tokens: number;
      total_output_tokens: number;
      total_cost_usd: number;
      avg_duration_ms: number;
      total_words: number;
    };

    const unfilteredCount = db
      .prepare("SELECT COUNT(*) as count FROM transcription_history")
      .get() as { count: number };

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
      unfiltered_total_sessions: unfilteredCount.count,
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
    const countRow = db
      .prepare("SELECT COUNT(*) as count FROM transcription_history")
      .get() as { count: number };
    db.exec("DELETE FROM transcription_history");
    capture("history cleared", { deleted_count: countRow.count });
    return c.json({ ok: true });
  });

export default history;
