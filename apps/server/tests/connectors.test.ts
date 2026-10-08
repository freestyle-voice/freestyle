import { afterEach, describe, expect, it, vi } from "vitest";
import createApp from "../src/index.js";
import { freestyleCloudUrl } from "../src/lib/freestyle-cloud.js";
import { createMcpStore } from "../src/lib/mcp/store.js";
import { clearSession, setSession } from "../src/lib/sessions.js";

const app = createApp();

afterEach(() => {
  clearSession();
  vi.unstubAllGlobals();
});

describe("connector proxy", () => {
  it("lets guests browse and search the public catalog without a bearer", async () => {
    clearSession();
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        connectors: [{ slug: "gmail", connection: null }],
        nextCursor: "next",
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.request(
      "/api/connectors/catalog?search=mail&cursor=page-2&limit=24",
    );
    expect(response.status).toBe(200);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      `${freestyleCloudUrl()}/v2/connectors/public/catalog?search=mail&cursor=page-2&limit=24`,
    );
    expect(fetchMock.mock.calls[0]?.[1].headers).not.toHaveProperty(
      "Authorization",
    );
    await expect(response.json()).resolves.toMatchObject({
      nextCursor: "next",
    });
  });

  it.each([
    ["GET", "/api/connectors/gmail/status"],
    ["POST", "/api/connectors/gmail/connect"],
    ["POST", "/api/connectors/gmail/disconnect"],
    ["POST", "/api/connectors/catalog"],
  ])("keeps guest %s %s protected", async (method, path) => {
    clearSession();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await app.request(path, { method })).status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves the authenticated catalog and its server-owned bearer", async () => {
    setSession({
      token: "cloud-session",
      user: { id: "user-1", email: "user@example.com" },
      host: freestyleCloudUrl(),
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValue(Response.json({ connectors: [], nextCursor: null }));
    vi.stubGlobal("fetch", fetchMock);
    expect((await app.request("/api/connectors/catalog?limit=24")).status).toBe(
      200,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      `${freestyleCloudUrl()}/v2/connectors/catalog?limit=24`,
      expect.objectContaining({
        headers: { Authorization: "Bearer cloud-session" },
      }),
    );
  });

  it("requires the server-owned Freestyle Cloud session", async () => {
    const response = await app.request("/api/connectors");

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "cloud_auth_required",
    });
  });

  it("forwards the stable chat thread, Remix context, and trusted capabilities to Cloud", async () => {
    setSession({
      token: "cloud-session",
      user: { id: "user-1", email: "user@example.com" },
      host: freestyleCloudUrl(),
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("stream", {
        headers: { "content-type": "text/event-stream" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.request("/api/agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "transport-chat-id",
        threadId: "stable-thread-id",
        context: {
          selection: "Draft text",
          appName: "Notes",
          windowTitle: "Inbox",
          capturedAt: 1,
        },
        messages: [{ id: "message-1", role: "user", parts: [] }],
      }),
    });

    expect(response.status).toBe(200);
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(request.body as string)).toMatchObject({
      threadId: "stable-thread-id",
      client: {
        platform: process.platform,
        supportsDownloadsSave: true,
        supportsCursorActions: true,
      },
      context: {
        selection: "Draft text",
        appName: "Notes",
        windowTitle: "Inbox",
        capturedAt: 1,
      },
    });
    expect(JSON.parse(request.body as string).client.localTools).toEqual([
      "current_time",
      "save_file",
      "Bash",
      "Read",
      "Write",
      "Edit",
      "Glob",
      "Grep",
    ]);
  });

  it("forwards MCP schemas without exposing local connection credentials", async () => {
    setSession({
      token: "cloud-session",
      user: { id: "user-1", email: "user@example.com" },
      host: freestyleCloudUrl(),
    });
    const store = createMcpStore();
    const connection = store.create({
      name: "Private files",
      transport: "http",
      url: "https://mcp.example.com/mcp",
      authType: "bearer",
      bearerToken: "local-secret",
      enabled: true,
    });
    store.saveTools(connection.id, [
      {
        originalName: "search",
        wireName: "mcp_1_search",
        description: "Search private files.",
        inputSchema: { type: "object" },
      },
    ]);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("stream", {
        headers: { "content-type": "text/event-stream" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await app.request("/api/agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        threadId: "stable-thread-id",
        messages: [{ id: "message-1", role: "user", parts: [] }],
      }),
    });

    const forwarded = JSON.parse(
      (fetchMock.mock.calls[0]?.[1] as RequestInit).body as string,
    );
    expect(forwarded.mcpTools).toEqual([
      {
        name: "mcp_1_search",
        description: "Search private files.",
        inputSchema: { type: "object" },
      },
    ]);
    expect(JSON.stringify(forwarded)).not.toContain("local-secret");
    store.remove(connection.id);
  });
});
