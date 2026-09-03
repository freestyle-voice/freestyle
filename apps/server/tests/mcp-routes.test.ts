import { afterEach, describe, expect, it } from "vitest";
import createApp from "../src/index.js";

const app = createApp();
const createdIds: string[] = [];

afterEach(async () => {
  await Promise.all(
    createdIds
      .splice(0)
      .map((id) =>
        app.request(`/api/mcp/connections/${id}`, { method: "DELETE" }),
      ),
  );
});

describe("MCP routes", () => {
  it("creates and lists a redacted local connection", async () => {
    const created = await app.request("/api/mcp/connections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Filesystem",
        transport: "stdio",
        command: "mcp-filesystem",
        env: { ACCESS_TOKEN: "secret" },
      }),
    });

    expect(created.status).toBe(201);
    const connection = (await created.json()) as { id: string };
    createdIds.push(connection.id);
    expect(JSON.stringify(connection)).not.toContain("secret");

    const listed = await app.request("/api/mcp/connections");
    expect(listed.status).toBe(200);
    expect(await listed.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: connection.id, name: "Filesystem" }),
      ]),
    );
  });

  it("does not let an OAuth connection bypass its browser authorization by starting enabled", async () => {
    const response = await app.request("/api/mcp/connections", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "OAuth tools",
        transport: "http",
        url: "https://mcp.example.com/mcp",
        authType: "oauth",
        enabled: true,
      }),
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "mcp_oauth_required",
    });
  });

  it("refuses a disabled MCP tool before opening a client connection", async () => {
    const response = await app.request("/api/mcp/calls", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        toolName: "mcp_999_search",
        input: { query: "hello" },
      }),
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "mcp_tool_not_found",
    });
  });

  it("rejects an OAuth callback with no one-time state", async () => {
    const response = await app.request("/api/mcp/oauth/callback?code=code");

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "mcp_oauth_invalid_state",
    });
  });
});
