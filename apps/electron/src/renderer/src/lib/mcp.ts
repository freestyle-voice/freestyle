import type {
  McpConnectionInput,
  McpConnectionSummary,
} from "@freestyle-voice/validations";
import { getLocalApiBase, resolveApiBase } from "@renderer/lib/api";

function asToolResult(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

async function responseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | { error?: unknown; detail?: unknown }
    | T
    | null;
  if (!response.ok) {
    const error = payload as { error?: unknown; detail?: unknown } | null;
    const message =
      (typeof error?.detail === "string" && error.detail) ||
      (error?.error === "mcp_oauth_required"
        ? "Connect this account before enabling its tools."
        : error?.error === "mcp_tool_limit_reached"
          ? "Remix can use up to 40 enabled MCP tools. Disable another connection first."
          : typeof error?.error === "string" && error.error) ||
      "The MCP connection request failed";
    throw new Error(message);
  }
  return payload as T;
}

/** MCP is deliberately bound to this device's local server, never a configured remote server. */
async function localMcpFetch(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  await resolveApiBase();
  return fetch(`${getLocalApiBase()}${path}`, init);
}

export async function listMcpConnections(): Promise<McpConnectionSummary[]> {
  return responseJson<McpConnectionSummary[]>(
    await localMcpFetch("/api/mcp/connections"),
  );
}

export async function createMcpConnection(
  input: McpConnectionInput,
): Promise<McpConnectionSummary> {
  return responseJson<McpConnectionSummary>(
    await localMcpFetch("/api/mcp/connections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }),
  );
}

export async function removeMcpConnection(id: string): Promise<void> {
  await responseJson<{ ok: true }>(
    await localMcpFetch(`/api/mcp/connections/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  );
}

export async function testMcpConnection(
  id: string,
): Promise<{ toolCount: number }> {
  return responseJson<{ ok: true; toolCount: number }>(
    await localMcpFetch(`/api/mcp/connections/${encodeURIComponent(id)}/test`, {
      method: "POST",
    }),
  );
}

export async function setMcpConnectionEnabled(
  id: string,
  enabled: boolean,
): Promise<void> {
  await responseJson<{ ok: true }>(
    await localMcpFetch(
      `/api/mcp/connections/${encodeURIComponent(id)}/enable`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled }),
      },
    ),
  );
}

export async function startMcpOAuth(id: string): Promise<string> {
  const result = await responseJson<{ url: string }>(
    await localMcpFetch(
      `/api/mcp/connections/${encodeURIComponent(id)}/oauth/start`,
      {
        method: "POST",
      },
    ),
  );
  return result.url;
}

/** Execute a Cloud-declared MCP tool through the device-local MCP runtime. */
export async function executeMcpToolCall(
  toolName: string,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  try {
    const response = await localMcpFetch("/api/mcp/calls", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ toolName, input }),
    });
    if (!response.ok) return { ok: false, reason: "mcp-tool-failed" };
    return (
      asToolResult(await response.json()) ?? {
        ok: false,
        reason: "mcp-tool-invalid-response",
      }
    );
  } catch {
    return { ok: false, reason: "mcp-tool-unavailable" };
  }
}
