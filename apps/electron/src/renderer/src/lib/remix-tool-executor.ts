import type { RemixSelectionPayload } from "@shared/remix";
import type { AgentToolCall } from "./agent-tools";
import { executeMcpToolCall } from "./mcp";

export interface RemixToolExecutionOptions {
  /** Keep the pill's next request grounded in a fresh live capture. */
  onContext?: (context: RemixSelectionPayload) => void;
}

const str = (input: Record<string, unknown>, key: string): string =>
  typeof input[key] === "string" ? input[key] : "";

const num = (
  input: Record<string, unknown>,
  key: string,
): number | undefined =>
  typeof input[key] === "number" ? input[key] : undefined;

const badArgs = (
  input: unknown,
  expected: string,
): Record<string, unknown> => ({
  ok: false,
  reason: "bad-args",
  expected,
  received: JSON.stringify(input)?.slice(0, 300) ?? "undefined",
});

/**
 * The canonical `/api/agent` thread can be rendered by either the compact
 * pill or the full workspace. Keep non-approved local tool dispatch here so
 * the two surfaces cannot drift in MCP or cursor behavior.
 */
export async function executeRemixTool(
  call: AgentToolCall,
  options: RemixToolExecutionOptions = {},
): Promise<Record<string, unknown>> {
  const input = (call.input ?? {}) as Record<string, unknown>;
  if (call.toolName.startsWith("mcp_")) {
    return executeMcpToolCall(call.toolName, input);
  }

  switch (call.toolName) {
    case "get_context": {
      const result = await window.api.remixGetContext();
      if (result.ok) {
        options.onContext?.({
          text: result.selection,
          appName: result.appName,
          windowTitle: result.windowTitle,
          url: result.url,
          clipboard: result.clipboardPreview ?? null,
          clipboardLength: result.clipboardLength ?? 0,
          capturedAt: Date.now(),
        });
      }
      return { ...result };
    }
    case "read_document":
      return { ...(await window.api.remixReadDocument()) };
    case "select_all":
      return { ...(await window.api.remixSelectAll()) };
    case "select_text":
      if (!str(input, "text")) return badArgs(call.input, "{ text: string }");
      return {
        ...(await window.api.remixSelectText(
          str(input, "text"),
          num(input, "occurrence"),
        )),
      };
    case "collapse_selection":
      return { ...(await window.api.remixCollapseSelection()) };
    case "copy":
      return { ...(await window.api.remixCopy()) };
    case "set_clipboard":
      if (!str(input, "text")) return badArgs(call.input, "{ text: string }");
      return { ...(await window.api.remixSetClipboard(str(input, "text"))) };
    case "set_clipboard_image":
      if (!str(input, "url")) return badArgs(call.input, "{ url: string }");
      return {
        ...(await window.api.remixSetClipboardImage(str(input, "url"))),
      };
    case "paste":
      return { ...(await window.api.remixPasteClipboard()) };
    case "undo":
      return { ...(await window.api.remixUndo()) };
    case "redo":
      return { ...(await window.api.remixRedo()) };
    case "press_key":
      if (!str(input, "key")) return badArgs(call.input, "{ key: string }");
      return {
        ...(await window.api.remixPressKey(
          str(input, "key"),
          num(input, "times"),
        )),
      };
    case "get_clipboard":
      return { ...(await window.api.remixGetClipboard()) };
    default:
      return { ok: false, reason: `unknown tool: ${call.toolName}` };
  }
}
