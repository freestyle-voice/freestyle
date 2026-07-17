import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { type JSONSchema7, jsonSchema, type Tool, tool } from "ai";
import type { McpServerConfig } from "./config.js";

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
): Promise<{ connection: McpConnection; tools: Record<string, Tool> }> {
  const client = new Client(
    { name: "freestyle-voice-agent", version: "0.1.0" },
    { capabilities: {} },
  );

  const transport =
    server.transport === "http"
      ? new StreamableHTTPClientTransport(new URL(requireUrl(server)))
      : new StdioClientTransport({
          command: requireCommand(server),
          args: server.args ?? [],
          env: { ...pickPathEnv(), ...(server.env ?? {}) },
        });

  await client.connect(transport);

  const { tools: mcpTools } = await client.listTools();
  const tools: Record<string, Tool> = {};

  for (const mcpTool of mcpTools) {
    const namespaced = `${server.id}__${mcpTool.name}`;
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
        return result.content ?? result;
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
 * Connect every enabled MCP server and merge their tools. A server that fails
 * to connect is skipped (with its error recorded) rather than failing the whole
 * turn — one broken server shouldn't take the agent down.
 */
export async function connectEnabledServers(
  servers: McpServerConfig[],
  log: (msg: string) => void,
): Promise<{
  tools: Record<string, Tool>;
  connections: McpConnection[];
}> {
  const enabled = servers.filter((s) => s.enabled);
  const tools: Record<string, Tool> = {};
  const connections: McpConnection[] = [];

  const settled = await Promise.allSettled(
    enabled.map((s) => connectMcpServer(s)),
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

function requireUrl(server: McpServerConfig): string {
  if (!server.url) {
    throw new Error(`MCP server "${server.name}" is missing a URL`);
  }
  return server.url;
}

function requireCommand(server: McpServerConfig): string {
  if (!server.command) {
    throw new Error(`MCP server "${server.name}" is missing a command`);
  }
  return server.command;
}

/** Pass through PATH so spawned stdio servers can resolve their executables. */
function pickPathEnv(): Record<string, string> {
  const path = process.env.PATH;
  return path ? { PATH: path } : {};
}
