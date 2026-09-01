import { beforeEach, describe, expect, it, vi } from "vitest";

const { getLocalApiBase, resolveApiBase } = vi.hoisted(() => ({
  getLocalApiBase: vi.fn(() => "http://127.0.0.1:4649"),
  resolveApiBase: vi.fn(),
}));
const fetchMock = vi.fn();

vi.mock("@renderer/lib/api", () => ({ getLocalApiBase, resolveApiBase }));

import { executeMcpToolCall, listMcpConnections } from "./mcp";

describe("executeMcpToolCall", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("sends an MCP tool result request only to the local server", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          content: [{ type: "text", text: "Found it" }],
        }),
      ),
    );

    await expect(
      executeMcpToolCall("mcp_4_search_documents", { query: "roadmap" }),
    ).resolves.toEqual({
      ok: true,
      content: [{ type: "text", text: "Found it" }],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:4649/api/mcp/calls",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          toolName: "mcp_4_search_documents",
          input: { query: "roadmap" },
        }),
      },
    );
  });

  it("turns a local MCP failure into a model-safe tool result", async () => {
    fetchMock.mockResolvedValue(new Response("unavailable", { status: 502 }));

    await expect(
      executeMcpToolCall("mcp_4_search_documents", {}),
    ).resolves.toEqual({
      ok: false,
      reason: "mcp-tool-failed",
    });
  });

  it("lists only the renderer-safe connection summaries", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify([
          {
            id: "mcp_2",
            name: "Search",
            transport: "http",
            url: "https://mcp.example.com/mcp",
            enabled: false,
            authType: "oauth",
            authStatus: "not_connected",
            toolCount: 0,
            lastError: null,
            updatedAt: 1,
          },
        ]),
      ),
    );

    await expect(listMcpConnections()).resolves.toEqual([
      expect.objectContaining({ id: "mcp_2", authType: "oauth" }),
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:4649/api/mcp/connections",
      undefined,
    );
  });

  it("surfaces an API error message without attempting to parse a second response body", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "mcp_oauth_required" }), {
        status: 409,
      }),
    );

    await expect(listMcpConnections()).rejects.toThrow(
      "Connect this account before enabling its tools.",
    );
  });
});
