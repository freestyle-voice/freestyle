import { randomUUID } from "node:crypto";
import { createAppLogger } from "@freestyle-voice/utils";

const log = createAppLogger("remix-agent-tool-bridge");

export type RemixToolOutput = Record<string, unknown>;

interface PendingCall {
  resolve: (output: RemixToolOutput) => void;
  timer: NodeJS.Timeout;
}

export interface ToolCallEvent {
  id: string;
  tool: string;
  input: unknown;
}

const TOOL_CALL_TIMEOUT_MS = 60_000;

const pending = new Map<string, PendingCall>();
let subscriber: ((event: ToolCallEvent) => void) | null = null;

export function subscribeToolChannel(
  send: (event: ToolCallEvent) => void,
): () => void {
  subscriber = send;
  return () => {
    if (subscriber === send) subscriber = null;
  };
}

export function toolChannelConnected(): boolean {
  return subscriber !== null;
}

export function resolveToolCall(id: string, output: RemixToolOutput): boolean {
  const call = pending.get(id);
  if (!call) return false;
  pending.delete(id);
  clearTimeout(call.timer);
  call.resolve(output);
  return true;
}

export function requestClientTool(
  tool: string,
  input: unknown,
): Promise<RemixToolOutput> {
  const send = subscriber;
  if (!send) {
    return Promise.resolve({
      ok: false,
      reason: "client-not-connected",
      detail: "The Freestyle overlay isn't listening for tool calls.",
    });
  }

  const id = randomUUID();
  return new Promise<RemixToolOutput>((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      log.warn(
        `Tool call ${tool} (${id}) timed out after ${TOOL_CALL_TIMEOUT_MS}ms`,
      );
      resolve({ ok: false, reason: "timeout" });
    }, TOOL_CALL_TIMEOUT_MS);
    pending.set(id, { resolve, timer });
    try {
      send({ id, tool, input });
    } catch (err) {
      pending.delete(id);
      clearTimeout(timer);
      log.error(`Tool channel send failed: ${err}`);
      resolve({ ok: false, reason: "client-not-connected" });
    }
  });
}
