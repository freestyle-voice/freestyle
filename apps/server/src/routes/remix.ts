import { createAppLogger } from "@freestyle-voice/utils";
import {
  MCP_TOOLS_MAX,
  REMIX_LOCAL_TOOL_NAMES,
  remixAgentRequestSchema,
  remixMcpToolsSchema,
} from "@freestyle-voice/validations";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { freestyleCloudUrl } from "../lib/freestyle-cloud.js";
import { createMcpStore } from "../lib/mcp/store.js";
import { getSessionToken, invalidateSession } from "../lib/sessions.js";

const log = createAppLogger("remix");

/**
 * The cursor-facing Remix agent lives in Cloud. Keep the bearer token in the
 * local server, while preserving the captured desktop context and AI SDK
 * stream for the pill renderer.
 */
const remixRoute = new Hono().post(
  "/",
  zValidator("json", remixAgentRequestSchema),
  async (c) => {
    const token = getSessionToken();
    if (!token) return c.json({ error: "cloud_auth_required" }, 401);

    let upstream: Response;
    try {
      upstream = await fetch(`${freestyleCloudUrl()}/v2/remix`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        // The renderer never chooses Cloud-visible MCP tools. Resolve the
        // current enabled, desktop-owned registry here so raw endpoints,
        // credentials, and stale renderer state cannot cross this boundary.
        body: JSON.stringify({
          ...c.req.valid("json"),
          // The current expanded pill pauses for a native approval card
          // before any file or shell action. The flag is additive so older
          // Remix clients retain their existing document/MCP tool surface.
          client: {
            platform: process.platform,
            localTools: REMIX_LOCAL_TOOL_NAMES,
            supportsDownloadsSave: true,
          },
          mcpTools: remixMcpToolsSchema.parse(
            createMcpStore()
              // Cloud accepts a deliberately bounded tool surface. A user can
              // keep more connections enabled locally, but one oversized
              // registry must never turn an otherwise ordinary Remix prompt
              // into a 500 response.
              .listEnabledTools()
              .slice(0, MCP_TOOLS_MAX)
              .map(({ tool }) => ({
                name: tool.wireName,
                description: tool.description,
                inputSchema: tool.inputSchema,
              })),
          ),
        }),
        signal: c.req.raw.signal,
      });
    } catch (error) {
      log.error(
        `Remix cloud request failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return c.json({ error: "remix_unavailable" }, 502);
    }

    if (upstream.status === 401) {
      invalidateSession();
      return c.json({ error: "cloud_auth_required" }, 401);
    }

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("content-type") ?? "application/json",
        ...(upstream.ok && upstream.body
          ? { "x-vercel-ai-ui-message-stream": "v1" }
          : {}),
      },
    });
  },
);

export default remixRoute;
