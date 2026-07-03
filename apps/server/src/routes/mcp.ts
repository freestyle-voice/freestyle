import {
  createFormatSchema,
  createVocabularySchema,
  DEFAULT_CLEANUP_INTENSITY,
  dictionarySchema,
  updateDictionarySchema,
  updateFormatSchema,
  updateVocabularySchema,
} from "@freestyle-voice/validations";
import { StreamableHTTPTransport } from "@hono/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Hono } from "hono";
import { z } from "zod/v3";
import dictionary from "./dictionary.js";
import formats from "./formats.js";
import history from "./history.js";
import settings from "./settings.js";
import vocabulary from "./vocabulary.js";

async function call(
  app: Hono,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ data: any; ok: boolean }> {
  const init: RequestInit = { method };
  if (body) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify(body);
  }
  const res = await app.request(path, init);
  const data = await res.json();
  return { data, ok: res.ok };
}

function text(value: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
  };
}

function error(message: string) {
  return {
    content: [{ type: "text" as const, text: message }],
    isError: true,
  };
}

const listParams = {
  limit: z.number().int().min(1).max(200).default(50).describe("Max results"),
  offset: z.number().int().min(0).default(0).describe("Pagination offset"),
  search: z.string().optional().describe("Filter by keyword"),
};

function listQuery(args: {
  limit: number;
  offset: number;
  search?: string;
}): string {
  const params = new URLSearchParams({
    limit: String(args.limit),
    offset: String(args.offset),
  });
  if (args.search) params.set("search", args.search);
  return params.toString();
}

const idParam = { id: z.number().int().describe("Record ID") };

const mcpServer = new McpServer({
  name: "freestyle",
  version: "0.0.2",
});

// --- Format tools ---
// Formatting rules shape the final output style based on the active app or
// context. `app_pattern` is a pipe-delimited list of substrings (e.g.
// "slack|discord") matched case-insensitively against the active context;
// `instructions` describe how the text should be formatted there.

mcpServer.tool(
  "format_list",
  "List formatting rules (output-style rules matched by app/context). Returns full rows, so no separate view-by-id is needed.",
  listParams,
  async (args) => {
    const { data } = await call(formats, "GET", `/?${listQuery(args)}`);
    return text(data);
  },
);

mcpServer.tool(
  "format_match",
  "Find which formatting rule applies to a given context string (e.g. an app name or window title). Returns the matching rule or null. Use this to check existing coverage before creating an overlapping rule.",
  { context: z.string().describe("Context to match, e.g. app name or title") },
  async ({ context }) => {
    const { data } = await call(
      formats,
      "GET",
      `/match?context=${encodeURIComponent(context)}`,
    );
    return text(data);
  },
);

mcpServer.tool(
  "format_create",
  "Create a formatting rule. `app_pattern` is a pipe-delimited list of substrings (e.g. 'slack|discord') matched against the active context; `instructions` describe the desired output style there.",
  createFormatSchema.shape,
  async (args) => {
    const { data, ok } = await call(formats, "POST", "/", args);
    if (!ok) return error(data.error ?? "Failed to create format rule");
    return text(data);
  },
);

mcpServer.tool(
  "format_update",
  "Update an existing formatting rule",
  { ...idParam, ...updateFormatSchema.shape },
  async ({ id, ...body }) => {
    const { data, ok } = await call(formats, "PUT", `/${id}`, body);
    if (!ok) return error(data.error ?? `Format rule #${id} not found`);
    return text({ ok: true, id });
  },
);

mcpServer.tool(
  "format_delete",
  "Delete a formatting rule",
  idParam,
  async ({ id }) => {
    await call(formats, "DELETE", `/${id}`);
    return text({ ok: true, id });
  },
);

// --- Dictionary tools ---
// Dictionary entries are EXACT text replacements applied AFTER transcription
// (key -> value, e.g. "gpt" -> "GPT"). Use these to fix consistent
// spelling/casing in the final output. For helping the recognizer hear a term
// correctly in the first place, use the vocabulary tools instead.

mcpServer.tool(
  "dict_list",
  "List dictionary entries (exact post-transcription replacements). Returns full rows, so no separate view-by-id is needed.",
  listParams,
  async (args) => {
    const { data } = await call(dictionary, "GET", `/?${listQuery(args)}`);
    return text(data);
  },
);

mcpServer.tool(
  "dict_create",
  "Create a dictionary entry: an exact replacement applied after transcription (`key` is the text to find, `value` is what to replace it with).",
  dictionarySchema.shape,
  async (args) => {
    const { data, ok } = await call(dictionary, "POST", "/", args);
    if (!ok) return error(data.error ?? "Failed to create dictionary entry");
    return text(data);
  },
);

mcpServer.tool(
  "dict_update",
  "Update an existing dictionary entry",
  { ...idParam, ...updateDictionarySchema.shape },
  async ({ id, ...body }) => {
    const { data, ok } = await call(dictionary, "PUT", `/${id}`, body);
    if (!ok) return error(data.error ?? `Dictionary entry #${id} not found`);
    return text(data);
  },
);

mcpServer.tool(
  "dict_delete",
  "Delete a dictionary entry",
  idParam,
  async ({ id }) => {
    await call(dictionary, "DELETE", `/${id}`);
    return text({ ok: true, id });
  },
);

// --- Vocabulary tools ---
// Vocabulary terms are recognition BIAS hints applied BEFORE/DURING
// transcription. Use these to help the speech recognizer correctly hear names,
// jargon, and acronyms. `notes` can describe pronunciation or context. For
// fixing already-transcribed text, use the dictionary tools instead.

mcpServer.tool(
  "vocab_list",
  "List vocabulary terms (recognition bias hints for the speech model). Returns full rows, so no separate view-by-id is needed.",
  listParams,
  async (args) => {
    const { data } = await call(vocabulary, "GET", `/?${listQuery(args)}`);
    return text(data);
  },
);

mcpServer.tool(
  "vocab_create",
  "Create a vocabulary term to bias recognition toward a name/jargon/acronym (`term` is the word or phrase; optional `notes` add context).",
  createVocabularySchema.shape,
  async (args) => {
    const { data, ok } = await call(vocabulary, "POST", "/", args);
    if (!ok) return error(data.error ?? "Failed to create vocabulary term");
    return text(data);
  },
);

mcpServer.tool(
  "vocab_update",
  "Update an existing vocabulary term",
  { ...idParam, ...updateVocabularySchema.shape },
  async ({ id, ...body }) => {
    const { data, ok } = await call(vocabulary, "PUT", `/${id}`, body);
    if (!ok) return error(data.error ?? `Vocabulary term #${id} not found`);
    return text(data);
  },
);

mcpServer.tool(
  "vocab_delete",
  "Delete a vocabulary term",
  idParam,
  async ({ id }) => {
    await call(vocabulary, "DELETE", `/${id}`);
    return text({ ok: true, id });
  },
);

// --- History tools (read-only) ---
// Transcription history is your evidence source: read it to spot recurring
// jargon, names, or mistakes, then curate dictionary/vocabulary/format rules
// accordingly. History is intentionally read-only over MCP.

mcpServer.tool(
  "history_list",
  "List transcription history (read-only). Use as evidence for which dictionary, vocabulary, or format rules to add.",
  listParams,
  async (args) => {
    const { data } = await call(history, "GET", `/?${listQuery(args)}`);
    return text(data);
  },
);

// --- Cleanup settings (read-only) ---

mcpServer.tool(
  "cleanup_get",
  "Get the current post-processing cleanup style (intensity and any custom prompt). Read-only context to understand how transcripts are cleaned before suggesting changes.",
  {},
  async () => {
    const { data } = await call(settings, "GET", "/");
    const all = (data ?? {}) as Record<string, string>;
    return text({
      cleanup_intensity: all.cleanup_intensity ?? DEFAULT_CLEANUP_INTENSITY,
      cleanup_custom_prompt: all.cleanup_custom_prompt ?? "",
    });
  },
);

const transport = new StreamableHTTPTransport();

const mcp = new Hono().all("/", async (c) => {
  if (!mcpServer.isConnected()) {
    await mcpServer.connect(transport);
  }
  const response = await transport.handleRequest(c);
  return response ?? c.body(null, 204);
});

export default mcp;
