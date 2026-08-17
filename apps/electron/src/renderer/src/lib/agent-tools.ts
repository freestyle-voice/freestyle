import { apiFetch } from "@renderer/lib/api";
import {
  approveConnectorAction,
  connectorToolActionName,
  executeConnectorAction,
  isConnectorToolName,
  isReadOnlyConnectorToolName,
} from "@renderer/lib/connectors";
import { parseSpriteEmotion } from "@shared/sprite-events";

export type AgentToolTier = "free" | "confirmed";

export interface AgentToolCall {
  toolName: string;
  toolCallId: string;
  input: unknown;
}

const BASH_ALLOWLIST = new Set([
  "ls",
  "cat",
  "grep",
  "find",
  "head",
  "tail",
  "wc",
  "pwd",
  "date",
  "echo",
  "which",
  "file",
  "du",
]);

const BASH_SAFE_SHAPE = /^[a-zA-Z0-9_./\s"'*=:,+-]+$/;

const BASH_MUTATING_FLAGS: Record<string, RegExp> = {
  find: /(^|\s)-(delete|exec|execdir|ok|okdir|fprint0?|fprintf|fls)(\s|$)/,
};

export function bashIsReadOnly(command: string): boolean {
  if (!BASH_SAFE_SHAPE.test(command)) return false;
  const first = command.trim().split(/\s+/)[0] ?? "";
  if (!BASH_ALLOWLIST.has(first)) return false;
  return !BASH_MUTATING_FLAGS[first]?.test(command);
}

const str = (input: Record<string, unknown>, key: string): string =>
  typeof input[key] === "string" ? (input[key] as string) : "";

export async function agentToolTier(
  call: AgentToolCall,
): Promise<AgentToolTier | null> {
  const input = (call.input ?? {}) as Record<string, unknown>;
  void input;
  if (isConnectorToolName(call.toolName))
    return isReadOnlyConnectorToolName(call.toolName) ? "free" : "confirmed";
  switch (call.toolName) {
    case "current_time":
    case "emote":
      return "free";
    // Cursor/screen/clipboard tools disabled for now — see AGENT_CLIENT_TOOLS.
    // case "get_context":
    // case "read_document":
    // case "get_clipboard":
    //   return "free";
    // case "set_clipboard":
    // case "paste":
    //   return "confirmed";
    case "Bash":
      return bashIsReadOnly(str(input, "command")) ? "free" : "confirmed";
    case "Read":
    case "Glob":
    case "Grep":
      return "free";
    case "Write":
    case "Edit":
      return "confirmed";
    default:
      return null;
  }
}

export function describeAgentAction(call: AgentToolCall): string {
  const input = (call.input ?? {}) as Record<string, unknown>;
  if (isConnectorToolName(call.toolName)) {
    const action =
      connectorToolActionName(call.toolName).replace(/_/g, " ").toLowerCase() ||
      "connected-app action";
    return `Use a connected app to ${action}.`;
  }
  switch (call.toolName) {
    // Cursor/clipboard tools disabled for now.
    // case "set_clipboard": {
    //   const text = str(input, "text");
    //   const preview = text.length > 120 ? `${text.slice(0, 120)}…` : text;
    //   return `Put this on your clipboard (${text.length} characters):\n“${preview}”`;
    // }
    // case "paste":
    //   return "Paste the clipboard into the app you're using, at your cursor.";
    case "Bash": {
      const command = str(input, "command");
      const preview =
        command.length > 300 ? `${command.slice(0, 300)}…` : command;
      return `Run in your shell:\n$ ${preview}`;
    }
    case "Read":
      return `Read the file ${str(input, "path")}`;
    case "Write": {
      const text = str(input, "text");
      return `Write ${text.length} characters to ${str(input, "path")}`;
    }
    case "Edit":
      return `Edit the file ${str(input, "path")}`;
    case "Glob":
      return `List files under ${str(input, "path")}`;
    case "Grep":
      return `Search files under ${str(input, "path")}`;
    default:
      return `Run ${call.toolName.replace(/_/g, " ")}.`;
  }
}

async function runOsTool(
  route: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const res = await apiFetch(`/api/agent-os/${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { ok: false, reason: `os-http-${res.status}` };
  return (await res.json()) as Record<string, unknown>;
}

export async function executeAgentTool(
  call: AgentToolCall,
  threadId?: string,
): Promise<Record<string, unknown>> {
  const input = (call.input ?? {}) as Record<string, unknown>;
  const badArgs = (expected: string): Record<string, unknown> => ({
    ok: false,
    reason: "bad-args",
    expected,
    received: JSON.stringify(call.input)?.slice(0, 300) ?? "undefined",
  });

  try {
    if (isConnectorToolName(call.toolName)) {
      if (!threadId) return { ok: false, reason: "missing-thread" };
      const approval = await approveConnectorAction({
        threadId,
        toolName: call.toolName,
        input,
      });
      return await executeConnectorAction({
        approvalToken: approval.approvalToken,
        threadId,
        toolName: call.toolName,
        input,
      });
    }
    switch (call.toolName) {
      case "current_time": {
        const now = new Date();
        return {
          iso: now.toISOString(),
          local: now.toLocaleString(),
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        };
      }
      case "emote": {
        window.api.spriteEvent({
          kind: "emote",
          emotion: parseSpriteEmotion(input.emotion),
        });
        return { ok: true };
      }
      // Cursor/screen/clipboard tools disabled for now — restore together
      // with their AGENT_CLIENT_TOOLS entries and the agent-prompt guidance.
      // case "get_context":
      //   return { ...(await window.api.remixGetContext()) };
      // case "read_document":
      //   return { ...(await window.api.remixReadDocument()) };
      // case "get_clipboard":
      //   return { ...(await window.api.remixGetClipboard()) };
      // case "set_clipboard":
      //   if (!str(input, "text")) return badArgs("{ text: string }");
      //   return {
      //     ...(await window.api.remixSetClipboard(str(input, "text"))),
      //   };
      // case "paste":
      //   // The theater contract: the sprite travels to the caret and swings;
      //   // this resolves at the impact frame (or a hard ceiling), so the
      //   // paste lands on the hit. A missing sprite resolves immediately.
      //   await window.api
      //     .spritePerformSync({ name: "paste", toolClass: "deliver" })
      //     .catch(() => {});
      //   return { ...(await window.api.remixPasteClipboard()) };
      case "Bash":
        if (!str(input, "command")) return badArgs("{ command: string }");
        return runOsTool("bash", { command: str(input, "command") });
      case "Read":
        if (!str(input, "path")) return badArgs("{ path: string }");
        return runOsTool("read", {
          path: str(input, "path"),
          offset: input.offset,
          limit: input.limit,
        });
      case "Write":
        if (!str(input, "path")) return badArgs("{ path, text }");
        return runOsTool("write", {
          path: str(input, "path"),
          text: str(input, "text"),
        });
      case "Edit":
        if (!str(input, "path") || !str(input, "old"))
          return badArgs("{ path, old, new }");
        return runOsTool("edit", {
          path: str(input, "path"),
          old: str(input, "old"),
          new: str(input, "new"),
        });
      case "Glob":
        if (!str(input, "pattern")) return badArgs("{ pattern: string }");
        return runOsTool("glob", {
          pattern: str(input, "pattern"),
          path: str(input, "path") || undefined,
        });
      case "Grep":
        if (!str(input, "query")) return badArgs("{ query: string }");
        return runOsTool("grep", {
          query: str(input, "query"),
          path: str(input, "path") || undefined,
        });
      default:
        return { ok: false, reason: `unknown tool: ${call.toolName}` };
    }
  } catch (err) {
    return {
      ok: false,
      reason: "tool-failed",
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

export const DECLINED_OUTPUT: Record<string, unknown> = {
  ok: false,
  reason: "user-declined",
};
