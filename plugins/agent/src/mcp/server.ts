import { StreamableHTTPTransport } from "@hono/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { MiddlewareHandler } from "hono";
import { registerBuiltinTools } from "./index.js";

let mcpServer: McpServer | null = null;
let transport: StreamableHTTPTransport | null = null;

function ensureServer(): {
  server: McpServer;
  transport: StreamableHTTPTransport;
} {
  if (!mcpServer || !transport) {
    mcpServer = new McpServer({
      name: "freestyle-tools",
      version: "0.1.0",
    });
    registerBuiltinTools(mcpServer);

    transport = new StreamableHTTPTransport();
  }
  return { server: mcpServer, transport };
}

/**
 * Create a Hono middleware handler that serves the built-in MCP server at the
 * given path matcher. External MCP clients (Claude Desktop, Cursor, etc.) can
 * connect to `http://<host>/api/plugins/<slug>/mcp` using Streamable HTTP
 * transport.
 */
export function createMcpMiddleware(
  matchPath: (reqPath: string) => boolean,
): MiddlewareHandler {
  return async (c, next) => {
    if (!matchPath(c.req.path)) return next();

    const { server, transport: t } = ensureServer();

    if (!server.isConnected()) {
      await server.connect(t);
    }

    const result = await t.handleRequest(c);
    return result ?? next();
  };
}
