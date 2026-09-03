import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { createMcpStore } from "../src/lib/mcp/store.js";
import { initSchema } from "../src/lib/schema.js";

describe("MCP connection store", () => {
  let db: DatabaseSync | undefined;

  afterEach(() => db?.close());

  it("migrates and redacts secrets from a stored connection summary", () => {
    db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createMcpStore(db);

    const connection = store.create({
      name: "Private remote tools",
      transport: "http",
      url: "https://mcp.example.com/mcp",
      authType: "bearer",
      bearerToken: "secret-token",
      enabled: true,
    });

    expect(connection).toMatchObject({
      id: "mcp_1",
      name: "Private remote tools",
      authType: "bearer",
      toolCount: 0,
    });
    expect(JSON.stringify(connection)).not.toContain("secret-token");
    expect(store.getPrivate("mcp_1")?.secret).toEqual({
      bearerToken: "secret-token",
    });
  });

  it("removes OAuth state and cached tools when a connection is deleted", () => {
    db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createMcpStore(db);
    const connection = store.create({
      name: "Remote tools",
      transport: "http",
      url: "https://mcp.example.com/mcp",
      authType: "oauth",
    });
    store.saveOAuth(connection.id, {
      state: "one-time-state",
      stateExpiresAt: 123,
      codeVerifier: "proof",
    });
    store.saveTools(connection.id, [
      {
        originalName: "search",
        wireName: "mcp_1_search",
        description: "Search documents",
        inputSchema: { type: "object" },
      },
    ]);

    expect(store.remove(connection.id)).toBe(true);
    expect(store.getPrivate(connection.id)).toBeUndefined();
    expect(store.getOAuth(connection.id)).toBeUndefined();
    expect(store.getTools(connection.id)).toEqual([]);
  });

  it("reports the persisted OAuth authorization state without exposing it", () => {
    db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createMcpStore(db);
    const connection = store.create({
      name: "OAuth tools",
      transport: "http",
      url: "https://mcp.example.com/mcp",
      authType: "oauth",
    });

    store.saveOAuth(connection.id, { tokens: { access_token: "secret" } });

    expect(store.list()).toEqual([
      expect.objectContaining({ id: connection.id, authStatus: "connected" }),
    ]);
    expect(JSON.stringify(store.list())).not.toContain("secret");
  });

  it("counts only enabled cached tools when composing the Cloud surface", () => {
    db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createMcpStore(db);
    const enabled = store.create({
      name: "Enabled tools",
      transport: "stdio",
      command: "mcp-enabled",
      enabled: true,
    });
    const disabled = store.create({
      name: "Disabled tools",
      transport: "stdio",
      command: "mcp-disabled",
    });
    store.saveTools(enabled.id, [
      {
        originalName: "read",
        wireName: "mcp_1_read",
        description: "Read a document",
        inputSchema: {},
      },
    ]);
    store.saveTools(disabled.id, [
      {
        originalName: "write",
        wireName: "mcp_2_write",
        description: "Write a document",
        inputSchema: {},
      },
    ]);

    expect(store.enabledToolCount()).toBe(1);
    expect(store.enabledToolCount(enabled.id)).toBe(0);
  });

  it("keeps the previous tool cache when a replacement cannot be stored", () => {
    db = new DatabaseSync(":memory:");
    initSchema(db);
    const store = createMcpStore(db);
    const connection = store.create({
      name: "Atomic tools",
      transport: "stdio",
      command: "mcp-atomic",
    });
    const previous = {
      originalName: "read",
      wireName: "mcp_1_read",
      description: "Read",
      inputSchema: {},
    };
    store.saveTools(connection.id, [previous]);

    expect(() =>
      store.saveTools(connection.id, [
        previous,
        { ...previous, originalName: "read-again" },
      ]),
    ).toThrow();
    expect(store.getTools(connection.id)).toEqual([previous]);
  });
});
