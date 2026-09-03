import {
  mcpConnectionInputSchema,
  mcpConnectionSummarySchema,
  remixMcpToolSchema,
} from "@freestyle-voice/validations";
import { describe, expect, it } from "vitest";

describe("MCP connection contracts", () => {
  it("accepts a local stdio connection without exposing its environment", () => {
    const result = mcpConnectionInputSchema.parse({
      name: "Filesystem",
      transport: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      env: { API_TOKEN: "secret" },
    });

    expect(result.transport).toBe("stdio");
    expect(result.env).toEqual({ API_TOKEN: "secret" });
  });

  it("rejects a remote URL that embeds credentials", () => {
    const result = mcpConnectionInputSchema.safeParse({
      name: "Unsafe",
      transport: "http",
      url: "https://token@example.com/mcp",
      authType: "none",
    });

    expect(result.success).toBe(false);
  });

  it("rejects transport-controlled custom headers", () => {
    expect(
      mcpConnectionInputSchema.safeParse({
        name: "Unsafe headers",
        transport: "http",
        url: "https://mcp.example.com/mcp",
        authType: "headers",
        headers: { Host: "internal.example.com" },
      }).success,
    ).toBe(false);
  });

  it("accepts OAuth only for remote HTTP connections", () => {
    expect(
      mcpConnectionInputSchema.parse({
        name: "Remote tools",
        transport: "http",
        url: "https://mcp.example.com/mcp",
        authType: "oauth",
      }).authType,
    ).toBe("oauth");

    expect(
      mcpConnectionInputSchema.safeParse({
        name: "Wrong transport",
        transport: "stdio",
        command: "mcp-server",
        authType: "oauth",
      }).success,
    ).toBe(false);
  });

  it("rejects mixed static authentication so a supplied secret is never silently ignored", () => {
    const base = {
      name: "Remote tools",
      transport: "http" as const,
      url: "https://mcp.example.com/mcp",
    };

    expect(
      mcpConnectionInputSchema.safeParse({
        ...base,
        authType: "bearer",
        bearerToken: "token",
        headers: { "X-API-Key": "also-a-secret" },
      }).success,
    ).toBe(false);
    expect(
      mcpConnectionInputSchema.safeParse({
        ...base,
        authType: "headers",
        bearerToken: "also-a-secret",
        headers: { "X-API-Key": "token" },
      }).success,
    ).toBe(false);
  });

  it("accepts only redacted connection summaries", () => {
    expect(
      mcpConnectionSummarySchema.safeParse({
        id: "mcp_1",
        name: "Remote tools",
        transport: "http",
        url: "https://mcp.example.com/mcp",
        enabled: true,
        authType: "bearer",
        authStatus: "connected",
        toolCount: 2,
        secret: "must-not-leak",
      }).success,
    ).toBe(false);
  });

  it("accepts bounded, namespaced tool schemas for the cloud turn", () => {
    expect(
      remixMcpToolSchema.parse({
        name: "mcp_12_search_documents",
        description: "Search the connected document index.",
        inputSchema: {
          type: "object",
          properties: { query: { type: "string" } },
          required: ["query"],
        },
      }),
    ).toMatchObject({ name: "mcp_12_search_documents" });

    expect(
      remixMcpToolSchema.safeParse({
        name: "mcp_12_search_documents",
        description: "Search the connected document index.",
        inputSchema: {},
        bearerToken: "must-not-cross-the-boundary",
      }).success,
    ).toBe(false);

    expect(
      remixMcpToolSchema.safeParse({
        name: "web_search",
        description: "Collides with a native Cloud tool.",
        inputSchema: {},
      }).success,
    ).toBe(false);
  });
});
