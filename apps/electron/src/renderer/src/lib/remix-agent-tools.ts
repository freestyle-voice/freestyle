import { apiFetch } from "./api";

interface ToolCallEvent {
  id: string;
  tool: string;
  input: unknown;
}

async function executeTool(
  name: string,
  rawInput: unknown,
): Promise<Record<string, unknown>> {
  const input = (rawInput ?? {}) as Record<string, unknown>;
  const str = (key: string): string =>
    typeof input[key] === "string" ? (input[key] as string) : "";
  const num = (key: string): number | undefined =>
    typeof input[key] === "number" ? (input[key] as number) : undefined;
  const badArgs = (expected: string): Record<string, unknown> => ({
    ok: false,
    reason: "bad-args",
    expected,
    received: JSON.stringify(rawInput)?.slice(0, 300) ?? "undefined",
  });

  switch (name) {
    case "get_context":
      return { ...(await window.api.remixGetContext()) };
    case "read_document":
      return { ...(await window.api.remixReadDocument()) };
    case "select_all":
      return { ...(await window.api.remixSelectAll()) };
    case "select_text":
      if (!str("text")) return badArgs("{ text: string }");
      return {
        ...(await window.api.remixSelectText(str("text"), num("occurrence"))),
      };
    case "collapse_selection":
      return { ...(await window.api.remixCollapseSelection()) };
    case "copy":
      return { ...(await window.api.remixCopy()) };
    case "set_clipboard":
      if (!str("text")) return badArgs("{ text: string }");
      return { ...(await window.api.remixSetClipboard(str("text"))) };
    case "set_clipboard_image":
      if (!str("url")) return badArgs("{ url: string }");
      return { ...(await window.api.remixSetClipboardImage(str("url"))) };
    case "paste":
      return { ...(await window.api.remixPasteClipboard()) };
    case "undo":
      return { ...(await window.api.remixUndo()) };
    case "redo":
      return { ...(await window.api.remixRedo()) };
    case "press_key":
      if (!str("key")) return badArgs("{ key: string }");
      return { ...(await window.api.remixPressKey(str("key"), num("times"))) };
    case "get_clipboard":
      return { ...(await window.api.remixGetClipboard()) };
    default:
      return { ok: false, reason: `unknown tool: ${name}` };
  }
}

async function postResult(id: string, output: Record<string, unknown>) {
  await apiFetch("/api/remix/claude-agent/tools/result", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, output }),
  }).catch(() => {});
}

function handleEvent(event: ToolCallEvent): void {
  void executeTool(event.tool, event.input)
    .catch(
      (err): Record<string, unknown> => ({
        ok: false,
        reason: "execution-failed",
        detail: err instanceof Error ? err.message : String(err),
      }),
    )
    .then((output) => postResult(event.id, output));
}

export function startRemixAgentToolBridge(): () => void {
  let stopped = false;
  let controller: AbortController | null = null;

  const run = async () => {
    let backoffMs = 1_000;
    while (!stopped) {
      controller = new AbortController();
      try {
        const res = await apiFetch("/api/remix/claude-agent/tools/channel", {
          signal: controller.signal,
        });
        if (!res.ok || !res.body) throw new Error(`channel ${res.status}`);
        backoffMs = 1_000;

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let currentEvent = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let newline = buffer.indexOf("\n");
          while (newline !== -1) {
            const line = buffer.slice(0, newline).trimEnd();
            buffer = buffer.slice(newline + 1);
            newline = buffer.indexOf("\n");
            if (line.startsWith("event:")) {
              currentEvent = line.slice(6).trim();
            } else if (
              line.startsWith("data:") &&
              currentEvent === "tool-call"
            ) {
              try {
                handleEvent(JSON.parse(line.slice(5).trim()) as ToolCallEvent);
              } catch {}
            }
          }
        }
      } catch {}
      if (stopped) return;
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
      backoffMs = Math.min(backoffMs * 2, 15_000);
    }
  };

  void run();
  return () => {
    stopped = true;
    controller?.abort();
  };
}
