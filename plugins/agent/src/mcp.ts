import { appendFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { type JSONSchema7, jsonSchema, type Tool, tool } from "ai";
import type { PluginStorage } from "freestyle-voice";
import type { McpServerConfig } from "./config.js";
import { PluginOAuthProvider, pendingOAuthTransports } from "./oauth.js";

/** Fast-fail timeout for connecting to an MCP server (ms). */
const MCP_CONNECT_TIMEOUT_MS = 10_000;

/** Where the widget diagnostic dump is written (see dumpWidgetResult). */
const WIDGET_DEBUG_FILE = join(tmpdir(), "freestyle-mcp-widgets.log");

/** True if a tool result carries any embedded resource (i.e. a widget). */
function resultHasResource(result: unknown): boolean {
  const content = (result as { content?: unknown })?.content;
  const arr = Array.isArray(content) ? content : content ? [content] : [];
  return arr.some(
    (p) =>
      typeof p === "object" &&
      p !== null &&
      (p as { type?: string }).type === "resource",
  );
}

/**
 * Append the full raw tool result to a temp file whenever it contains a widget
 * resource. This is a self-serve diagnostic: reproduce the flow once, then
 * share the file so we can see exactly how the server ships its widget
 * (mimeType, uri, _meta, inline HTML / QR data). Writes the FULL payload — no
 * truncation — because the widget body (e.g. a QR data URL) is the whole point.
 */
function dumpWidgetResult(toolName: string, result: unknown): void {
  try {
    const entry =
      `\n===== ${new Date().toISOString()} ${toolName} =====\n` +
      `${JSON.stringify(result, null, 2)}\n`;
    appendFileSync(WIDGET_DEBUG_FILE, entry);
  } catch {
    // Diagnostics are best-effort; never break a tool call over logging.
  }
}

/** A live MCP connection plus the AI SDK tools it exposes. */
export interface McpConnection {
  serverId: string;
  serverName: string;
  client: Client;
  close(): Promise<void>;
}

/**
 * Connect to a single MCP server and return its tools in AI SDK format, keyed
 * by a namespaced name (`<serverId>__<toolName>`) so tools from different
 * servers can't collide. Throws on connection failure; the caller decides
 * whether to skip the server or surface the error.
 */
export async function connectMcpServer(
  server: McpServerConfig,
  opts?: { storage?: PluginStorage; pluginSlug?: string },
): Promise<{ connection: McpConnection; tools: Record<string, Tool> }> {
  const client = new Client(
    { name: "freestyle-voice-agent", version: "0.1.0" },
    { capabilities: {} },
  );

  let transport: StdioClientTransport | StreamableHTTPClientTransport;

  if (server.transport === "http") {
    const url = new URL(requireUrl(server));
    const transportOpts: Record<string, unknown> = {};

    if (server.auth === "oauth" && opts?.storage && opts?.pluginSlug) {
      const provider = new PluginOAuthProvider(
        server.id,
        opts.storage,
        opts.pluginSlug,
      );
      transportOpts.authProvider = provider;
    } else if (server.auth === "headers") {
      const init = buildHttpRequestInit(server);
      if (init) transportOpts.requestInit = init;
    }

    const httpTransport = new StreamableHTTPClientTransport(url, transportOpts);

    if (server.auth === "oauth") {
      pendingOAuthTransports.set(server.id, httpTransport);
    }

    transport = httpTransport;
  } else {
    transport = new StdioClientTransport({
      ...splitCommand(requireCommand(server), server.args),
      env: { ...pickPathEnv(), ...(server.env ?? {}) },
      stderr: "pipe",
    });
  }

  try {
    await withTimeout(client.connect(transport), MCP_CONNECT_TIMEOUT_MS);
  } catch (err) {
    if (err instanceof UnauthorizedError && server.auth === "oauth") {
      // Keep the transport in pendingOAuthTransports — the browser will
      // redirect to the callback endpoint, which needs to call finishAuth()
      // on this transport instance.
      throw new Error(
        `OAuth authorization required for "${server.name}". Complete the flow in your browser, then retry.`,
      );
    }
    // Non-OAuth errors: clean up.
    pendingOAuthTransports.delete(server.id);
    throw err;
  }

  // Connection succeeded — clear from pending map (tokens are now saved).
  pendingOAuthTransports.delete(server.id);

  const { tools: mcpTools } = await client.listTools();
  const tools: Record<string, Tool> = {};

  for (const mcpTool of mcpTools) {
    const namespaced = `${server.id}__${mcpTool.name}`;
    // MCP Apps pattern: the tool links to a UI resource via _meta.ui.resourceUri.
    // We fetch that resource after the call and fold it into the content so the
    // downstream extractor sees a uniform embedded-resource shape.
    const uiResourceUri = extractMetaUiUri(mcpTool);
    tools[namespaced] = tool({
      description: mcpTool.description ?? mcpTool.name,
      inputSchema: jsonSchema(
        (mcpTool.inputSchema as JSONSchema7 | undefined) ?? {
          type: "object",
          properties: {},
        },
      ),
      execute: async (args) => {
        const result = await client.callTool({
          name: mcpTool.name,
          arguments: args as Record<string, unknown>,
        });

        // TEMP DIAGNOSTIC: when a result carries a widget resource, dump the
        // full raw payload to a temp file so we can see exactly how this server
        // ships interactive widgets. Remove once widget rendering is resolved.
        if (resultHasResource(result)) {
          dumpWidgetResult(mcpTool.name, result);
        }

        const content = Array.isArray(result.content)
          ? [...(result.content as unknown[])]
          : result.content
            ? [result.content]
            : [];

        // MCP Apps: fetch the linked UI resource and embed it in the content.
        // The _meta link is itself the widget marker, so accept the first
        // returned resource (fall back to any text/html one).
        if (uiResourceUri && !contentHasUiResource(content)) {
          try {
            const res = await client.readResource({ uri: uiResourceUri });
            const uiContent =
              (res.contents ?? []).find((rc) =>
                isUiResource(rc as { mimeType?: unknown; uri?: unknown }),
              ) ??
              (res.contents ?? []).find((rc) =>
                String((rc as { mimeType?: string }).mimeType ?? "")
                  .toLowerCase()
                  .startsWith("text/html"),
              );
            if (uiContent) {
              content.push({ type: "resource", resource: uiContent });
            }
          } catch {
            // Resource fetch failed — fall back to text content only.
          }
        }

        // Some servers embed a UI resource in the result *by reference*: a
        // `{type:"resource"}` block with a `uri` but no inline `text`/`blob`.
        // Fetch the referenced resource so the widget has content to render.
        await hydrateResourceRefs(client, content);

        return content.length > 0 ? content : result;
      },
    });
  }

  const connection: McpConnection = {
    serverId: server.id,
    serverName: server.name,
    client,
    close: () => client.close(),
  };

  return { connection, tools };
}

/**
 * Whether a resource is an interactive MCP UI widget.
 *
 * Servers use several conventions, so we recognize any of:
 *  - the MCP Apps profile MIME (`text/html;profile=mcp-app`);
 *  - the mcp-ui MIME variants (`application/vnd.mcp-ui+html`, etc.);
 *  - the OpenAI Apps SDK MIME (`text/html+skybridge`);
 *  - the `ui://` URI scheme (mcp-ui convention);
 *  - a `text/html` resource whose body actually contains HTML markup, or an
 *    `http(s)` resource URI (hosted widget) — these are the fallbacks for
 *    servers (e.g. Swiggy) that don't stamp a widget-specific marker.
 *
 * A plain `text/plain` / JSON resource is NOT a widget.
 */
export function isUiResource(resource: {
  mimeType?: unknown;
  uri?: unknown;
  text?: unknown;
  blob?: unknown;
}): boolean {
  const mime = String(resource.mimeType ?? "").toLowerCase();
  const uri = String(resource.uri ?? "").toLowerCase();

  // Explicit widget markers.
  if (
    mime.includes("profile=mcp-app") ||
    mime.includes("mcp-app") ||
    mime.includes("mcp-ui") ||
    mime.includes("mcp+ui") ||
    mime.includes("skybridge") ||
    uri.startsWith("ui://")
  ) {
    return true;
  }

  // Hosted widget: an http(s) resource served as HTML is meant to be embedded.
  if (uri.startsWith("http") && mime.includes("html")) return true;

  // Inline HTML body under a text/html resource — treat as a widget when the
  // body actually looks like markup (not an escaped snippet in JSON output).
  if (mime.startsWith("text/html")) {
    const body =
      (typeof resource.text === "string" ? resource.text : "") ||
      (typeof resource.blob === "string" ? "\u0000blob" : "");
    return body.length > 0;
  }

  return false;
}

/**
 * Fetch UI resources that are embedded by reference. A `{type:"resource"}`
 * block may carry only a `uri` (no inline `text`/`blob`); for a `ui://` or
 * `mcp://`/app resource we call `readResource` and inline the returned body so
 * the widget can render. `http(s)` URIs are left as-is — the renderer loads
 * those directly in the iframe.
 */
async function hydrateResourceRefs(
  client: Client,
  content: unknown[],
): Promise<void> {
  for (const part of content) {
    if (typeof part !== "object" || part === null) continue;
    const p = part as {
      type?: string;
      resource?: Record<string, unknown>;
    };
    if (p.type !== "resource" || !p.resource) continue;
    const r = p.resource;
    const uri = typeof r.uri === "string" ? r.uri : "";
    const hasInline =
      (typeof r.text === "string" && r.text.length > 0) ||
      (typeof r.blob === "string" && r.blob.length > 0);
    if (hasInline || !uri) continue;
    // External URLs render directly in the iframe — no fetch needed.
    if (uri.startsWith("http")) continue;
    try {
      const res = await client.readResource({ uri });
      const fetched = (res.contents ?? []).find(
        (rc) =>
          (typeof (rc as { text?: unknown }).text === "string" &&
            (rc as { text: string }).text.length > 0) ||
          typeof (rc as { blob?: unknown }).blob === "string",
      );
      if (fetched) {
        if (typeof (fetched as { text?: unknown }).text === "string") {
          r.text = (fetched as { text: string }).text;
        }
        if (typeof (fetched as { blob?: unknown }).blob === "string") {
          r.blob = (fetched as { blob: string }).blob;
        }
        if (!r.mimeType && (fetched as { mimeType?: unknown }).mimeType) {
          r.mimeType = (fetched as { mimeType: string }).mimeType;
        }
      }
    } catch {
      // Fetch failed — leave the ref as-is (renderer will skip if empty).
    }
  }
}

/** Pull the MCP Apps `_meta.ui.resourceUri` from a tool definition, if present. */
function extractMetaUiUri(mcpTool: unknown): string | undefined {
  if (typeof mcpTool !== "object" || mcpTool === null) return undefined;
  const meta = (mcpTool as { _meta?: unknown })._meta;
  if (typeof meta !== "object" || meta === null) return undefined;
  const ui = (meta as { ui?: unknown }).ui;
  if (typeof ui !== "object" || ui === null) return undefined;
  const uri = (ui as { resourceUri?: unknown }).resourceUri;
  return typeof uri === "string" ? uri : undefined;
}

/** Whether a content array already carries a UI resource block. */
function contentHasUiResource(content: unknown[]): boolean {
  return content.some((part) => {
    if (typeof part !== "object" || part === null) return false;
    const p = part as {
      type?: string;
      resource?: { mimeType?: unknown; uri?: unknown };
    };
    return p.type === "resource" && !!p.resource && isUiResource(p.resource);
  });
}

/**
 * Connect every enabled MCP server and merge their tools. A server that fails
 * to connect is skipped (with its error recorded) rather than failing the whole
 * turn — one broken server shouldn't take the agent down.
 */
export async function connectEnabledServers(
  servers: McpServerConfig[],
  log: (msg: string) => void,
  opts?: { storage?: PluginStorage; pluginSlug?: string },
): Promise<{
  tools: Record<string, Tool>;
  connections: McpConnection[];
}> {
  const enabled = servers.filter((s) => s.enabled && isConfigured(s));
  const tools: Record<string, Tool> = {};
  const connections: McpConnection[] = [];

  const settled = await Promise.allSettled(
    enabled.map((s) => connectMcpServer(s, opts)),
  );

  settled.forEach((result, i) => {
    const server = enabled[i];
    if (result.status === "fulfilled") {
      Object.assign(tools, result.value.tools);
      connections.push(result.value.connection);
    } else {
      log(
        `MCP server "${server.name}" failed to connect: ${
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason)
        }`,
      );
    }
  });

  return { tools, connections };
}

/** Close every open MCP connection, ignoring individual close failures. */
export async function closeConnections(
  connections: McpConnection[],
): Promise<void> {
  await Promise.allSettled(connections.map((c) => c.close()));
}

/** Build RequestInit with custom headers for HTTP transport. */
function buildHttpRequestInit(
  server: McpServerConfig,
): RequestInit | undefined {
  const h = server.headers;
  if (!h || Object.keys(h).length === 0) return undefined;
  return { headers: { ...h } };
}

function requireUrl(server: McpServerConfig): string {
  if (!server.url) {
    throw new Error(`MCP server "${server.name}" is missing a URL`);
  }
  return server.url;
}

/** A server is configured if it has the minimum required connection info. */
function isConfigured(server: McpServerConfig): boolean {
  if (server.transport === "http") return !!server.url?.trim();
  return !!server.command?.trim();
}

function requireCommand(server: McpServerConfig): string {
  if (!server.command) {
    throw new Error(`MCP server "${server.name}" is missing a command`);
  }
  return server.command;
}

/**
 * If the user entered a full command string in the command field (e.g.
 * `npx -y @modelcontextprotocol/server-filesystem /tmp`) and left the
 * args field empty, split it into command + args.  Without this, spawn
 * tries to find an executable named "npx -y ..." which fails and can
 * fall through to `sh`, causing JSON-RPC stdin to be executed as shell
 * commands (`sh: method:initialize: command not found`).
 */
function splitCommand(
  command: string,
  args: string[] | undefined,
): { command: string; args: string[] } {
  if (args && args.length > 0) return { command, args };
  const parts = command.trim().split(/\s+/);
  return { command: parts[0], args: parts.slice(1) };
}

/** Pass through PATH so spawned stdio servers can resolve their executables. */
function pickPathEnv(): Record<string, string> {
  const path = process.env.PATH;
  return path ? { PATH: path } : {};
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
  });
  // Clear the timer once the race settles so a resolved connection doesn't
  // leave a dangling timeout that fires later (unhandled rejection) and keeps
  // the event loop alive.
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
