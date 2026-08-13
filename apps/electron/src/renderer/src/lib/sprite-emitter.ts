import { classifyTool } from "@shared/sprite-events";
import type { UIMessage } from "ai";
import { useEffect, useRef } from "react";

type ToolPhase = "running" | "done";

interface ToolPartLike {
  type: string;
  toolCallId?: string;
  toolName?: string;
  state?: string;
  output?: unknown;
}

function toolNameOf(part: ToolPartLike): string | null {
  if (part.type === "dynamic-tool") return part.toolName ?? null;
  if (part.type.startsWith("tool-")) return part.type.slice(5);
  return null;
}

function outputFailed(output: unknown): boolean {
  return (
    typeof output === "object" &&
    output !== null &&
    (output as { ok?: unknown }).ok === false
  );
}

/**
 * Watches the agent loop and narrates it as sprite events: a tool part
 * appearing = start, its output landing = success/error, approval cards
 * pending, the turn finishing. On mount the existing thread is seeded
 * silently so resuming an old conversation doesn't replay its whole
 * history as theater. The emote tool is excluded — its execution IS the
 * event.
 */
export function useSpriteEmitter(
  messages: UIMessage[],
  approvalsCount: number,
  busy: boolean,
): void {
  const seen = useRef(new Map<string, ToolPhase>());
  const seeded = useRef(false);
  const prevApproval = useRef(false);
  const prevBusy = useRef(false);

  useEffect(() => {
    const emit = !seeded.current
      ? () => {}
      : (ev: Parameters<typeof window.api.spriteEvent>[0]) =>
          window.api.spriteEvent(ev);
    for (const msg of messages) {
      if (msg.role !== "assistant") continue;
      for (const part of msg.parts as ToolPartLike[]) {
        const name = toolNameOf(part);
        if (!name || name === "emote") continue;
        const id = part.toolCallId;
        if (!id) continue;
        const state = part.state ?? "";
        const terminal =
          state === "output-available" || state === "output-error";
        const toolClass = classifyTool(name);
        // Deliver-class tools perform through the sync lane (travel + swing
        // timed to the OS action) — emitting start here would double the
        // theater. Failures still get narrated.
        const synced = toolClass === "deliver";
        if (!seen.current.has(id)) {
          seen.current.set(id, "running");
          if (!synced) {
            emit({ kind: "tool", phase: "start", name, toolClass });
          }
        }
        if (seen.current.get(id) === "running" && terminal) {
          seen.current.set(id, "done");
          const failed = state === "output-error" || outputFailed(part.output);
          if (failed) {
            emit({ kind: "tool", phase: "error", name, toolClass });
          } else if (!synced) {
            emit({ kind: "tool", phase: "success", name, toolClass });
          }
        }
      }
    }
    seeded.current = true;
  }, [messages]);

  useEffect(() => {
    const pending = approvalsCount > 0;
    if (pending === prevApproval.current) return;
    prevApproval.current = pending;
    window.api.spriteEvent({ kind: "approval", pending });
  }, [approvalsCount]);

  useEffect(() => {
    if (prevBusy.current && !busy) {
      window.api.spriteEvent({ kind: "turn", phase: "done" });
    }
    prevBusy.current = busy;
  }, [busy]);
}
