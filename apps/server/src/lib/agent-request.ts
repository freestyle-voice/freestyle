import {
  MCP_TOOLS_MAX,
  REMIX_LOCAL_TOOL_NAMES,
  remixMcpToolsSchema,
} from "@freestyle-voice/validations";
import { createMcpStore } from "./mcp/store.js";

/**
 * The renderer may describe conversation context, but never gets to expand
 * the Cloud-visible local tool surface. Both legacy streaming and durable
 * turn admission use this one trusted desktop declaration.
 */
export function trustedDesktopAgentFields() {
  return {
    client: {
      platform: process.platform,
      localTools: REMIX_LOCAL_TOOL_NAMES,
      supportsDownloadsSave: true,
      supportsCursorActions: true,
    },
    // Only schemas cross this boundary. MCP endpoints and credentials remain
    // in the local store and tool execution stays on the desktop.
    mcpTools: remixMcpToolsSchema.parse(
      createMcpStore()
        .listEnabledTools()
        .slice(0, MCP_TOOLS_MAX)
        .map(({ tool }) => ({
          name: tool.wireName,
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
    ),
  };
}
