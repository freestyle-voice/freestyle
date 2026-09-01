import {
  MCP_TOOLS_MAX,
  mcpCallSchema,
  mcpConnectionInputSchema,
} from "@freestyle-voice/validations";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { z } from "zod/v3";
import {
  beginMcpOAuth,
  callMcpTool,
  completeMcpOAuth,
  discoverMcpTools,
  McpConnectionError,
} from "../lib/mcp/client.js";
import { validateMcpOAuthCallback } from "../lib/mcp/oauth.js";
import {
  createMcpStore,
  type StoredMcpConnection,
  type StoredMcpTool,
} from "../lib/mcp/store.js";

const MCP_TOOL_LIMIT_MESSAGE = `Enable at most ${MCP_TOOLS_MAX} MCP tools at a time`;

function errorMessage(error: unknown): string {
  if (error instanceof McpConnectionError) return error.message;
  return "The MCP connection could not complete that request";
}

function oauthStatus(connectionId: string, authType: string) {
  if (authType !== "oauth") return "not_required" as const;
  const oauth = createMcpStore().getOAuth(connectionId);
  if (oauth?.state && (oauth.stateExpiresAt ?? 0) > Date.now())
    return "pending" as const;
  if (oauth?.tokens && Object.keys(oauth.tokens).length > 0)
    return "connected" as const;
  return "not_connected" as const;
}

function toolLimitResponse() {
  return {
    error: "mcp_tool_limit_reached" as const,
    limit: MCP_TOOLS_MAX,
    detail: MCP_TOOL_LIMIT_MESSAGE,
  };
}

/**
 * A server can change its tool list between tests. Keep an enabled connection
 * from silently growing the Cloud-visible surface past the advertised cap.
 */
function saveDiscoveredTools(
  store: ReturnType<typeof createMcpStore>,
  connection: StoredMcpConnection,
  tools: StoredMcpTool[],
): { disabledForLimit: boolean } {
  store.saveTools(connection.id, tools);
  const disabledForLimit =
    connection.enabled && store.enabledToolCount() > MCP_TOOLS_MAX;
  if (disabledForLimit) store.setEnabled(connection.id, false);
  store.setLastError(
    connection.id,
    disabledForLimit ? MCP_TOOL_LIMIT_MESSAGE : null,
  );
  return { disabledForLimit };
}

const mcpRoute = new Hono()
  .get("/connections", (c) => c.json(createMcpStore().list()))
  .post("/connections", zValidator("json", mcpConnectionInputSchema), (c) => {
    const input = c.req.valid("json");
    if (
      input.enabled &&
      input.transport === "http" &&
      input.authType === "oauth"
    ) {
      return c.json({ error: "mcp_oauth_required" }, 409);
    }
    return c.json(createMcpStore().create(input), 201);
  })
  .delete("/connections/:id", (c) => {
    const removed = createMcpStore().remove(c.req.param("id"));
    return removed
      ? c.json({ ok: true })
      : c.json({ error: "mcp_connection_not_found" }, 404);
  })
  .get("/connections/:id/oauth", (c) => {
    const store = createMcpStore();
    const connection = store.getPrivate(c.req.param("id"));
    if (!connection) return c.json({ error: "mcp_connection_not_found" }, 404);
    return c.json({ status: oauthStatus(connection.id, connection.authType) });
  })
  .post(
    "/connections/:id/enable",
    zValidator("json", z.object({ enabled: z.boolean() })),
    (c) => {
      const store = createMcpStore();
      const connection = store.getPrivate(c.req.param("id"));
      if (!connection)
        return c.json({ error: "mcp_connection_not_found" }, 404);
      if (
        c.req.valid("json").enabled &&
        oauthStatus(connection.id, connection.authType) === "not_connected"
      ) {
        return c.json({ error: "mcp_oauth_required" }, 409);
      }
      if (
        c.req.valid("json").enabled &&
        store.enabledToolCount(connection.id) +
          store.getTools(connection.id).length >
          MCP_TOOLS_MAX
      ) {
        return c.json(toolLimitResponse(), 409);
      }
      store.setEnabled(connection.id, c.req.valid("json").enabled);
      return c.json({ ok: true });
    },
  )
  .post("/connections/:id/test", async (c) => {
    const store = createMcpStore();
    const connection = store.getPrivate(c.req.param("id"));
    if (!connection) return c.json({ error: "mcp_connection_not_found" }, 404);
    if (oauthStatus(connection.id, connection.authType) === "not_connected") {
      return c.json({ error: "mcp_oauth_required" }, 409);
    }
    try {
      const tools = await discoverMcpTools(connection, store);
      const { disabledForLimit } = saveDiscoveredTools(
        store,
        connection,
        tools,
      );
      return c.json({
        ok: true,
        toolCount: tools.length,
        ...(disabledForLimit ? { warning: MCP_TOOL_LIMIT_MESSAGE } : {}),
      });
    } catch (error) {
      store.setLastError(connection.id, errorMessage(error));
      return c.json(
        { error: "mcp_connection_unavailable", detail: errorMessage(error) },
        502,
      );
    }
  })
  .post("/connections/:id/oauth/start", async (c) => {
    const store = createMcpStore();
    const connection = store.getPrivate(c.req.param("id"));
    if (!connection) return c.json({ error: "mcp_connection_not_found" }, 404);
    try {
      const url = await beginMcpOAuth(connection, store);
      return c.json({ url: url.toString() });
    } catch (error) {
      store.setLastError(connection.id, errorMessage(error));
      return c.json(
        { error: "mcp_oauth_unavailable", detail: errorMessage(error) },
        502,
      );
    }
  })
  .get("/oauth/callback", async (c) => {
    const state = c.req.query("state");
    const code = c.req.query("code");
    if (!state) return c.json({ error: "mcp_oauth_invalid_state" }, 400);
    const store = createMcpStore();
    const pending = store.consumeOAuthState(state);
    const validated = validateMcpOAuthCallback(pending?.oauth, { state, code });
    if (!pending || !validated.ok)
      return c.json({ error: "mcp_oauth_invalid_state" }, 400);

    try {
      const tools = await completeMcpOAuth(
        pending.connection,
        validated.code,
        store,
      );
      const { disabledForLimit } = saveDiscoveredTools(
        store,
        pending.connection,
        tools,
      );
      store.clearOAuthAuthorization(pending.connection.id);
      return c.html(
        disabledForLimit
          ? `<!doctype html><title>Freestyle</title><p>Freestyle connected this MCP server, but it was left disabled because it would exceed the ${MCP_TOOLS_MAX}-tool limit. Return to the app to choose which connections to enable.</p>`
          : "<!doctype html><title>Freestyle</title><p>Freestyle connected this MCP server. You can return to the app.</p>",
      );
    } catch (error) {
      store.setLastError(pending.connection.id, errorMessage(error));
      return c.html(
        "<!doctype html><title>Freestyle</title><p>Freestyle could not connect this MCP server. Return to the app and try again.</p>",
        502,
      );
    }
  })
  .post("/calls", zValidator("json", mcpCallSchema), async (c) => {
    const store = createMcpStore();
    const { toolName, input } = c.req.valid("json");
    const found = store.findTool(toolName);
    if (!found) return c.json({ error: "mcp_tool_not_found" }, 404);
    if (!found.connection.enabled)
      return c.json({ error: "mcp_tool_disabled" }, 409);
    if (
      oauthStatus(found.connection.id, found.connection.authType) ===
      "not_connected"
    ) {
      return c.json({ error: "mcp_oauth_required" }, 409);
    }
    try {
      return c.json(
        await callMcpTool(found.connection, found.tool, input, store),
      );
    } catch (error) {
      store.setLastError(found.connection.id, errorMessage(error));
      return c.json({ ok: false, reason: "mcp_tool_failed" }, 502);
    }
  });

export default mcpRoute;
