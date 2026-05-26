import { StreamableHTTPTransport } from "@hono/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Hono } from "hono";
import { z } from "zod/v3";
import { getDb } from "../lib/db.js";

interface FormatRow {
  id: number;
  app_pattern: string;
  label: string;
  instructions: string;
  is_default: number;
  created_at: string;
  updated_at: string;
}

interface DictionaryRow {
  id: number;
  key: string;
  value: string;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

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

function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

const mcpServer = new McpServer({
  name: "freestyle",
  version: "0.0.2",
});

// --- Format tools ---

mcpServer.tool(
  "format_list",
  "List formatting rules with optional search and pagination",
  {
    limit: z.number().int().min(1).max(200).default(50).describe("Max results"),
    offset: z.number().int().min(0).default(0).describe("Pagination offset"),
    search: z
      .string()
      .optional()
      .describe("Search label, pattern, or instructions"),
  },
  async ({ limit, offset, search }) => {
    const db = getDb();
    let rows: FormatRow[];
    let countRow: { count: number };

    if (search) {
      const pattern = `%${search}%`;
      rows = db
        .prepare(
          "SELECT * FROM format_rules WHERE label LIKE ? OR app_pattern LIKE ? OR instructions LIKE ? ORDER BY is_default ASC, label ASC LIMIT ? OFFSET ?",
        )
        .all(
          pattern,
          pattern,
          pattern,
          limit,
          offset,
        ) as unknown as FormatRow[];
      countRow = db
        .prepare(
          "SELECT COUNT(*) as count FROM format_rules WHERE label LIKE ? OR app_pattern LIKE ? OR instructions LIKE ?",
        )
        .get(pattern, pattern, pattern) as unknown as { count: number };
    } else {
      rows = db
        .prepare(
          "SELECT * FROM format_rules ORDER BY is_default ASC, label ASC LIMIT ? OFFSET ?",
        )
        .all(limit, offset) as unknown as FormatRow[];
      countRow = db
        .prepare("SELECT COUNT(*) as count FROM format_rules")
        .get() as unknown as { count: number };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: formatJson({
            items: rows,
            total: countRow.count,
            limit,
            offset,
          }),
        },
      ],
    };
  },
);

mcpServer.tool(
  "format_view",
  "View a single formatting rule by ID",
  {
    id: z.number().int().describe("Format rule ID"),
  },
  async ({ id }) => {
    const db = getDb();
    const row = db.prepare("SELECT * FROM format_rules WHERE id = ?").get(id) as
      | FormatRow
      | undefined;

    if (!row) {
      return {
        content: [
          { type: "text" as const, text: `Format rule #${id} not found` },
        ],
        isError: true,
      };
    }

    return { content: [{ type: "text" as const, text: formatJson(row) }] };
  },
);

mcpServer.tool(
  "format_create",
  "Create a new formatting rule",
  {
    app_pattern: z
      .string()
      .describe("App pattern to match (e.g. 'slack|discord')"),
    label: z.string().describe("Display label"),
    instructions: z.string().describe("Formatting instructions for the LLM"),
  },
  async ({ app_pattern, label, instructions }) => {
    const db = getDb();
    const result = db
      .prepare(
        "INSERT INTO format_rules (app_pattern, label, instructions, is_default) VALUES (?, ?, ?, 0)",
      )
      .run(app_pattern, label, instructions);

    return {
      content: [
        {
          type: "text" as const,
          text: formatJson({
            id: result.lastInsertRowid,
            app_pattern,
            label,
            instructions,
          }),
        },
      ],
    };
  },
);

mcpServer.tool(
  "format_update",
  "Update an existing formatting rule",
  {
    id: z.number().int().describe("Format rule ID"),
    app_pattern: z.string().optional().describe("New app pattern"),
    label: z.string().optional().describe("New label"),
    instructions: z.string().optional().describe("New instructions"),
  },
  async ({ id, app_pattern, label, instructions }) => {
    const db = getDb();
    const existing = db
      .prepare("SELECT * FROM format_rules WHERE id = ?")
      .get(id) as FormatRow | undefined;

    if (!existing) {
      return {
        content: [
          { type: "text" as const, text: `Format rule #${id} not found` },
        ],
        isError: true,
      };
    }

    db.prepare(
      "UPDATE format_rules SET app_pattern = ?, label = ?, instructions = ?, updated_at = datetime('now') WHERE id = ?",
    ).run(
      app_pattern ?? existing.app_pattern,
      label ?? existing.label,
      instructions ?? existing.instructions,
      id,
    );

    return {
      content: [{ type: "text" as const, text: `Updated format rule #${id}` }],
    };
  },
);

mcpServer.tool(
  "format_delete",
  "Delete a formatting rule",
  {
    id: z.number().int().describe("Format rule ID"),
  },
  async ({ id }) => {
    const db = getDb();
    db.prepare("DELETE FROM format_rules WHERE id = ?").run(id);
    return {
      content: [{ type: "text" as const, text: `Deleted format rule #${id}` }],
    };
  },
);

// --- Dictionary tools ---

mcpServer.tool(
  "dict_list",
  "List dictionary entries with optional search and pagination",
  {
    limit: z.number().int().min(1).max(200).default(50).describe("Max results"),
    offset: z.number().int().min(0).default(0).describe("Pagination offset"),
    search: z.string().optional().describe("Search by key or value"),
  },
  async ({ limit, offset, search }) => {
    const db = getDb();
    let rows: DictionaryRow[];
    let countRow: { count: number };

    if (search) {
      const pattern = `%${search}%`;
      rows = db
        .prepare(
          "SELECT * FROM dictionary WHERE key LIKE ? OR value LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
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
          "SELECT * FROM dictionary ORDER BY created_at DESC LIMIT ? OFFSET ?",
        )
        .all(limit, offset) as unknown as DictionaryRow[];
      countRow = db
        .prepare("SELECT COUNT(*) as count FROM dictionary")
        .get() as unknown as { count: number };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: formatJson({
            items: rows,
            total: countRow.count,
            limit,
            offset,
          }),
        },
      ],
    };
  },
);

mcpServer.tool(
  "dict_view",
  "View a single dictionary entry by ID",
  {
    id: z.number().int().describe("Dictionary entry ID"),
  },
  async ({ id }) => {
    const db = getDb();
    const row = db.prepare("SELECT * FROM dictionary WHERE id = ?").get(id) as
      | DictionaryRow
      | undefined;

    if (!row) {
      return {
        content: [
          { type: "text" as const, text: `Dictionary entry #${id} not found` },
        ],
        isError: true,
      };
    }

    return { content: [{ type: "text" as const, text: formatJson(row) }] };
  },
);

mcpServer.tool(
  "dict_create",
  "Create a new dictionary entry (word replacement)",
  {
    key: z.string().describe("Word or phrase to match"),
    value: z.string().describe("Replacement text"),
  },
  async ({ key, value }) => {
    const db = getDb();
    try {
      const result = db
        .prepare("INSERT INTO dictionary (key, value) VALUES (?, ?)")
        .run(key.trim().toLowerCase(), value.trim());

      return {
        content: [
          {
            type: "text" as const,
            text: formatJson({
              id: result.lastInsertRowid,
              key: key.trim().toLowerCase(),
              value: value.trim(),
            }),
          },
        ],
      };
    } catch {
      return {
        content: [
          {
            type: "text" as const,
            text: `A dictionary entry with key "${key}" already exists`,
          },
        ],
        isError: true,
      };
    }
  },
);

mcpServer.tool(
  "dict_update",
  "Update an existing dictionary entry",
  {
    id: z.number().int().describe("Dictionary entry ID"),
    key: z.string().optional().describe("New key"),
    value: z.string().optional().describe("New value"),
  },
  async ({ id, key, value }) => {
    const db = getDb();
    const existing = db
      .prepare("SELECT * FROM dictionary WHERE id = ?")
      .get(id) as DictionaryRow | undefined;

    if (!existing) {
      return {
        content: [
          { type: "text" as const, text: `Dictionary entry #${id} not found` },
        ],
        isError: true,
      };
    }

    const newKey = key?.trim().toLowerCase() ?? existing.key;
    const newValue = value?.trim() ?? existing.value;

    try {
      db.prepare(
        "UPDATE dictionary SET key = ?, value = ?, updated_at = datetime('now') WHERE id = ?",
      ).run(newKey, newValue, id);

      return {
        content: [
          {
            type: "text" as const,
            text: formatJson({ id, key: newKey, value: newValue }),
          },
        ],
      };
    } catch {
      return {
        content: [
          {
            type: "text" as const,
            text: `A dictionary entry with key "${newKey}" already exists`,
          },
        ],
        isError: true,
      };
    }
  },
);

mcpServer.tool(
  "dict_delete",
  "Delete a dictionary entry",
  {
    id: z.number().int().describe("Dictionary entry ID"),
  },
  async ({ id }) => {
    const db = getDb();
    db.prepare("DELETE FROM dictionary WHERE id = ?").run(id);
    return {
      content: [
        { type: "text" as const, text: `Deleted dictionary entry #${id}` },
      ],
    };
  },
);

// --- History tools ---

mcpServer.tool(
  "history_list",
  "List transcription history with optional search and pagination",
  {
    limit: z.number().int().min(1).max(200).default(20).describe("Max results"),
    offset: z.number().int().min(0).default(0).describe("Pagination offset"),
    search: z
      .string()
      .optional()
      .describe("Search transcription text or model"),
  },
  async ({ limit, offset, search }) => {
    const db = getDb();
    let rows: HistoryRow[];
    let countRow: { count: number };

    if (search) {
      const pattern = `%${search}%`;
      rows = db
        .prepare(
          "SELECT * FROM transcription_history WHERE raw_text LIKE ? OR cleaned_text LIKE ? OR voice_model LIKE ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
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
          "SELECT COUNT(*) as count FROM transcription_history WHERE raw_text LIKE ? OR cleaned_text LIKE ? OR voice_model LIKE ?",
        )
        .get(pattern, pattern, pattern) as { count: number };
    } else {
      rows = db
        .prepare(
          "SELECT * FROM transcription_history ORDER BY created_at DESC LIMIT ? OFFSET ?",
        )
        .all(limit, offset) as unknown as HistoryRow[];
      countRow = db
        .prepare("SELECT COUNT(*) as count FROM transcription_history")
        .get() as { count: number };
    }

    return {
      content: [
        {
          type: "text" as const,
          text: formatJson({
            items: rows,
            total: countRow.count,
            limit,
            offset,
          }),
        },
      ],
    };
  },
);

mcpServer.tool(
  "history_stats",
  "Get transcription usage statistics",
  {},
  async () => {
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

    const today = db
      .prepare(
        `SELECT COUNT(*) as sessions, COALESCE(SUM(cost_usd), 0) as cost
         FROM transcription_history
         WHERE date(created_at, 'localtime') = date('now', 'localtime')`,
      )
      .get() as { sessions: number; cost: number };

    return {
      content: [
        {
          type: "text" as const,
          text: formatJson({
            ...stats,
            today_sessions: today.sessions,
            today_cost: today.cost,
          }),
        },
      ],
    };
  },
);

// --- Transport setup ---

const transport = new StreamableHTTPTransport();

const mcp = new Hono().all("/", async (c) => {
  if (!mcpServer.isConnected()) {
    await mcpServer.connect(transport);
  }
  const response = await transport.handleRequest(c);
  return response ?? c.body(null, 204);
});

export default mcp;
