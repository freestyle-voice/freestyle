import {
  createDictionarySchema,
  createFormatSchema,
  createShortcutSchema,
  updateDictionarySchema,
  updateFormatSchema,
  updateShortcutSchema,
} from "@freestyle/validations";
import { StreamableHTTPTransport } from "@hono/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Hono } from "hono";
import { z } from "zod/v3";
import dictionary from "./dictionary.js";
import formats from "./formats.js";
import history from "./history.js";
import shortcuts from "./shortcuts.js";

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

const idParam = { id: z.number().int().describe("Record ID") };

const mcpServer = new McpServer({
  name: "freestyle",
  version: "0.0.2",
});

// --- Format tools ---

mcpServer.tool(
  "format_list",
  "List formatting rules with optional search and pagination",
  listParams,
  async ({ limit, offset, search }) => {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    if (search) params.set("search", search);
    const { data } = await call(formats, "GET", `/?${params}`);
    return text(data);
  },
);

mcpServer.tool(
  "format_view",
  "View a single formatting rule by ID",
  idParam,
  async ({ id }) => {
    const { data, ok } = await call(formats, "GET", `/${id}`);
    if (!ok) return error(`Format rule #${id} not found`);
    return text(data);
  },
);

mcpServer.tool(
  "format_create",
  "Create a new formatting rule",
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

mcpServer.tool(
  "dict_list",
  "List dictionary entries with optional search and pagination",
  listParams,
  async ({ limit, offset, search }) => {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    if (search) params.set("search", search);
    const { data } = await call(dictionary, "GET", `/?${params}`);
    return text(data);
  },
);

mcpServer.tool(
  "dict_view",
  "View a single dictionary entry by ID",
  idParam,
  async ({ id }) => {
    const { data, ok } = await call(dictionary, "GET", `/${id}`);
    if (!ok) return error(`Dictionary entry #${id} not found`);
    return text(data);
  },
);

mcpServer.tool(
  "dict_create",
  "Create a new dictionary entry (word replacement)",
  createDictionarySchema.shape,
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

// --- Shortcut tools ---

mcpServer.tool(
  "shortcut_list",
  "List shortcuts with optional search and pagination",
  listParams,
  async ({ limit, offset, search }) => {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    if (search) params.set("search", search);
    const { data } = await call(shortcuts, "GET", `/?${params}`);
    return text(data);
  },
);

mcpServer.tool(
  "shortcut_view",
  "View a single shortcut by ID",
  idParam,
  async ({ id }) => {
    const { data, ok } = await call(shortcuts, "GET", `/${id}`);
    if (!ok) return error(`Shortcut #${id} not found`);
    return text(data);
  },
);

mcpServer.tool(
  "shortcut_create",
  "Create a new shortcut with trigger phrase and steps",
  createShortcutSchema.shape,
  async (args) => {
    const { data, ok } = await call(shortcuts, "POST", "/", args);
    if (!ok) return error(data.error ?? "Failed to create shortcut");
    return text(data);
  },
);

mcpServer.tool(
  "shortcut_update",
  "Update an existing shortcut",
  { ...idParam, ...updateShortcutSchema.shape },
  async ({ id, ...body }) => {
    const { data, ok } = await call(shortcuts, "PUT", `/${id}`, body);
    if (!ok) return error(data.error ?? `Shortcut #${id} not found`);
    return text({ ok: true, id });
  },
);

mcpServer.tool(
  "shortcut_delete",
  "Delete a shortcut",
  idParam,
  async ({ id }) => {
    await call(shortcuts, "DELETE", `/${id}`);
    return text({ ok: true, id });
  },
);

// --- History tools ---

mcpServer.tool(
  "history_list",
  "List transcription history with optional search and pagination",
  listParams,
  async ({ limit, offset, search }) => {
    const params = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    if (search) params.set("search", search);
    const { data } = await call(history, "GET", `/?${params}`);
    return text(data);
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
