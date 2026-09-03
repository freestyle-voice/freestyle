import {
  MCP_TOOLS_MAX,
  type RemixMcpTool,
  remixMcpToolSchema,
} from "@freestyle-voice/validations";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createMcpOAuthProvider } from "./oauth.js";
import type {
  StoredMcpConnection,
  StoredMcpOAuth,
  StoredMcpTool,
} from "./store.js";

const MCP_CONNECT_TIMEOUT_MS = 12_000;
const MCP_TOOL_TIMEOUT_MS = 30_000;
const MCP_TEXT_OUTPUT_MAX = 20_000;

/**
 * Only open ordinary web authorization pages. A remote MCP server controls
 * this URL, so forwarding arbitrary schemes to Electron's shell would let a
 * connection launch a local application instead of an OAuth page.
 */
export function isSafeMcpOAuthAuthorizationUrl(url: URL): boolean {
  const loopback =
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]";
  return (
    (url.protocol === "https:" || (url.protocol === "http:" && loopback)) &&
    !url.username &&
    !url.password
  );
}

export class McpConnectionError extends Error {
  constructor(
    readonly reason:
      | "auth-required"
      | "connection-unavailable"
      | "tool-unavailable"
      | "tool-failed",
    message: string,
  ) {
    super(message);
  }
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(
      () => reject(new McpConnectionError("connection-unavailable", message)),
      timeoutMs,
    );
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export function mcpWireName(
  connectionId: string,
  originalName: string,
): string {
  const id = /^mcp_([1-9][0-9]*)$/.exec(connectionId)?.[1];
  if (!id)
    throw new McpConnectionError("tool-unavailable", "Unknown MCP connection");
  const normalized = originalName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/^[^a-z]+/, "tool_")
    .slice(0, 48);
  if (!normalized)
    throw new McpConnectionError(
      "tool-unavailable",
      "MCP tool has an invalid name",
    );
  return `mcp_${id}_${normalized}`;
}

function capText(value: string): string {
  return value.length > MCP_TEXT_OUTPUT_MAX
    ? `${value.slice(0, MCP_TEXT_OUTPUT_MAX)}…`
    : value;
}

/** Remove binary payloads and cap text before MCP output reaches the model. */
export function sanitizeMcpToolOutput(result: unknown): {
  ok: boolean;
  content: Array<Record<string, unknown>>;
  structuredContent?: Record<string, unknown>;
} {
  const source =
    result && typeof result === "object"
      ? (result as Record<string, unknown>)
      : {};
  const rawContent = Array.isArray(source.content) ? source.content : [];
  const content = rawContent
    .slice(0, 20)
    .map((part): Record<string, unknown> => {
      const value =
        part && typeof part === "object"
          ? (part as Record<string, unknown>)
          : {};
      if (value.type === "text")
        return {
          type: "text",
          text: capText(typeof value.text === "string" ? value.text : ""),
        };
      if (value.type === "resource") {
        const resource =
          value.resource && typeof value.resource === "object"
            ? (value.resource as Record<string, unknown>)
            : {};
        return {
          type: "resource",
          uri:
            typeof resource.uri === "string"
              ? resource.uri.slice(0, 2_000)
              : "",
          text:
            typeof resource.text === "string"
              ? capText(resource.text)
              : undefined,
          omitted: true,
        };
      }
      return {
        type: typeof value.type === "string" ? value.type : "unknown",
        ...(typeof value.mimeType === "string"
          ? { mimeType: value.mimeType }
          : {}),
        omitted: true,
      };
    });
  const structured = source.structuredContent;
  const structuredContent =
    structured && typeof structured === "object" && !Array.isArray(structured)
      ? JSON.stringify(structured).length <= MCP_TEXT_OUTPUT_MAX
        ? (structured as Record<string, unknown>)
        : { omitted: true }
      : undefined;
  return {
    ok: source.isError !== true,
    content,
    ...(structuredContent ? { structuredContent } : {}),
  };
}

export type McpClientStore = {
  getOAuth(connectionId: string): StoredMcpOAuth | undefined;
  saveOAuth(connectionId: string, value: StoredMcpOAuth): void;
};

type McpListedTool = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

/**
 * Turn a server's discovery response into the bounded, Cloud-safe tool
 * contract. OAuth completion and an ordinary test share this exact boundary,
 * so they cannot disagree about names, size limits, or schema validation.
 */
function normalizeDiscoveredMcpTools(
  connection: StoredMcpConnection,
  tools: readonly McpListedTool[] | undefined,
): StoredMcpTool[] {
  const seen = new Set<string>();
  return (tools ?? []).slice(0, MCP_TOOLS_MAX).map((tool) => {
    const wireName = mcpWireName(connection.id, tool.name);
    if (seen.has(wireName))
      throw new McpConnectionError(
        "tool-unavailable",
        "MCP server has duplicate tool names",
      );
    seen.add(wireName);
    const cloudTool: RemixMcpTool = remixMcpToolSchema.parse({
      name: wireName,
      description:
        tool.description ||
        `Use the ${tool.name} tool from ${connection.name}.`,
      inputSchema: tool.inputSchema ?? {},
    });
    return {
      originalName: tool.name,
      wireName: cloudTool.name,
      description: cloudTool.description,
      inputSchema: cloudTool.inputSchema,
    };
  });
}

function createTransport(
  connection: StoredMcpConnection,
  store: McpClientStore,
  callbackUrl?: string,
  onAuthorizationUrl?: (url: URL) => void,
) {
  if (connection.transport === "stdio") {
    return new StdioClientTransport({
      command: connection.command!,
      args: connection.args,
      cwd: connection.cwd ?? undefined,
      env: {
        ...getDefaultEnvironment(),
        ...("env" in connection.secret ? connection.secret.env : {}),
      },
      stderr: "pipe",
    });
  }

  const headers = new Headers();
  if ("bearerToken" in connection.secret)
    headers.set("Authorization", `Bearer ${connection.secret.bearerToken}`);
  if ("headers" in connection.secret) {
    for (const [key, value] of Object.entries(connection.secret.headers))
      headers.set(key, value);
  }
  const hasStaticHeaders = [...headers.keys()].length > 0;
  if (connection.authType === "oauth" && !callbackUrl) {
    throw new McpConnectionError(
      "auth-required",
      "MCP OAuth requires the active local callback URL",
    );
  }
  return new StreamableHTTPClientTransport(new URL(connection.url!), {
    ...(connection.authType === "oauth"
      ? {
          authProvider: createMcpOAuthProvider(
            connection.id,
            store,
            callbackUrl!,
            onAuthorizationUrl,
          ),
        }
      : { requestInit: hasStaticHeaders ? { headers } : undefined }),
  });
}

export async function withMcpClient<T>(
  connection: StoredMcpConnection,
  store: McpClientStore,
  run: (client: Client) => Promise<T>,
  callbackUrl?: string,
  onAuthorizationUrl?: (url: URL) => void,
): Promise<T> {
  const client = new Client({ name: "Freestyle", version: "0.7.1" });
  const transport = createTransport(
    connection,
    store,
    callbackUrl,
    onAuthorizationUrl,
  );
  try {
    await withTimeout(
      client.connect(transport),
      MCP_CONNECT_TIMEOUT_MS,
      "MCP connection timed out",
    );
    return await run(client);
  } finally {
    await client.close().catch(() => {});
  }
}

export async function discoverMcpTools(
  connection: StoredMcpConnection,
  store: McpClientStore,
  callbackUrl?: string,
): Promise<StoredMcpTool[]> {
  return withMcpClient(
    connection,
    store,
    async (client) => {
      const response = await withTimeout(
        client.listTools(),
        MCP_CONNECT_TIMEOUT_MS,
        "MCP tool discovery timed out",
      );
      return normalizeDiscoveredMcpTools(connection, response.tools);
    },
    callbackUrl,
  );
}

/** Start MCP's OAuth authorization-code flow without invoking a tool. */
export async function beginMcpOAuth(
  connection: StoredMcpConnection,
  store: McpClientStore,
  callbackUrl: string,
): Promise<URL> {
  if (connection.transport !== "http" || connection.authType !== "oauth") {
    throw new McpConnectionError(
      "auth-required",
      "This connection does not use OAuth",
    );
  }
  let authorizationUrl: URL | undefined;
  try {
    await withMcpClient(
      connection,
      store,
      async () => undefined,
      callbackUrl,
      (url) => {
        authorizationUrl = url;
      },
    );
  } catch {
    // MCP's SDK normally interrupts `connect()` once it has surfaced the
    // authorization URL. That is still an untrusted URL from the remote
    // server, so the exception path must enforce the same scheme check as the
    // ordinary completion path below.
    if (authorizationUrl && isSafeMcpOAuthAuthorizationUrl(authorizationUrl)) {
      return authorizationUrl;
    }
    if (authorizationUrl) {
      throw new McpConnectionError(
        "connection-unavailable",
        "The MCP server did not request a safe web authorization page",
      );
    }
    throw new McpConnectionError(
      "connection-unavailable",
      "Could not start MCP authorization",
    );
  }
  if (!authorizationUrl || !isSafeMcpOAuthAuthorizationUrl(authorizationUrl)) {
    throw new McpConnectionError(
      "connection-unavailable",
      "The MCP server did not request a safe web authorization page",
    );
  }
  return authorizationUrl;
}

/** Exchange a callback code, reconnect, and return a fresh tool list. */
export async function completeMcpOAuth(
  connection: StoredMcpConnection,
  code: string,
  store: McpClientStore,
  callbackUrl: string,
): Promise<StoredMcpTool[]> {
  if (connection.transport !== "http" || connection.authType !== "oauth") {
    throw new McpConnectionError(
      "auth-required",
      "This connection does not use OAuth",
    );
  }
  const client = new Client({ name: "Freestyle", version: "0.7.1" });
  const transport = createTransport(connection, store, callbackUrl);
  if (!(transport instanceof StreamableHTTPClientTransport)) {
    throw new McpConnectionError(
      "auth-required",
      "This connection does not support OAuth",
    );
  }
  try {
    await withTimeout(
      transport.finishAuth(code),
      MCP_CONNECT_TIMEOUT_MS,
      "MCP OAuth exchange timed out",
    );
    await withTimeout(
      client.connect(transport),
      MCP_CONNECT_TIMEOUT_MS,
      "MCP connection timed out",
    );
    const response = await withTimeout(
      client.listTools(),
      MCP_CONNECT_TIMEOUT_MS,
      "MCP tool discovery timed out",
    );
    return normalizeDiscoveredMcpTools(connection, response.tools);
  } finally {
    await client.close().catch(() => {});
  }
}

export async function callMcpTool(
  connection: StoredMcpConnection,
  tool: StoredMcpTool,
  input: Record<string, unknown>,
  store: McpClientStore,
  callbackUrl?: string,
) {
  if (!connection.enabled)
    throw new McpConnectionError(
      "tool-unavailable",
      "This MCP connection is disabled",
    );
  return withMcpClient(
    connection,
    store,
    async (client) => {
      try {
        const response = await withTimeout(
          client.callTool({ name: tool.originalName, arguments: input }),
          MCP_TOOL_TIMEOUT_MS,
          "MCP tool call timed out",
        );
        return sanitizeMcpToolOutput(response);
      } catch (error) {
        if (error instanceof McpConnectionError) throw error;
        throw new McpConnectionError(
          "tool-failed",
          "The MCP tool could not complete",
        );
      }
    },
    callbackUrl,
  );
}
