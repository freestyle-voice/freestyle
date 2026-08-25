import {
  CloudAuthError,
  CloudRequestError,
  CloudUsageError,
} from "@freestyle-voice/utils/cloud";
import type { UIMessage } from "ai";
import { Platform } from "react-native";

import { cloud } from "@/lib/cloud/client";

import type {
  PendingConnectorApproval,
  RemixStreamEvent,
  RemixThreadOrigin,
  RemixThreadPage,
} from "./types";

const THREAD_PAGE_SIZE = 24;
const MOBILE_AGENT_CLIENT = {
  // The Cloud agent must not advertise desktop-local tools or Brain storage to
  // a mobile surface that cannot execute or expose either capability.
  platform: Platform.OS === "android" ? "android" : "ios",
} as const;

export type RemixThread = { id: string; messages: UIMessage[] };

export async function getLatestThread(): Promise<RemixThread | null> {
  const result = await cloud.json<{ thread: RemixThread | null }>(
    "/v2/threads/latest",
  );
  return result.thread;
}

export async function getThread(id: string): Promise<RemixThread | null> {
  try {
    const result = await cloud.json<{ thread: RemixThread | null }>(
      `/v2/threads/${encodeURIComponent(id)}`,
    );
    return result.thread;
  } catch (error) {
    // A thread can be cleared from another client while this screen is open.
    // Treat the Cloud's 404 as an unavailable thread, not a failed request.
    if (error instanceof CloudRequestError && error.status === 404) return null;
    throw error;
  }
}

export async function listThreads({
  origin = "user",
  cursor,
}: {
  origin?: RemixThreadOrigin;
  cursor?: number;
} = {}): Promise<RemixThreadPage> {
  const params = new URLSearchParams({
    origin,
    limit: String(THREAD_PAGE_SIZE),
  });
  if (cursor !== undefined) params.set("cursor", String(cursor));
  return cloud.json<RemixThreadPage>(`/v2/threads?${params.toString()}`);
}

type AgentStreamChunk = {
  type: string;
  delta?: unknown;
  toolCallId?: unknown;
  toolName?: unknown;
  input?: unknown;
  errorText?: unknown;
  output?: unknown;
  result?: unknown;
};

function eventFromFrame(frame: string): AgentStreamChunk | null {
  const data = frame
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.replace(/^data:\s?/, ""))
    .join("\n");
  if (!data || data === "[DONE]") return null;

  try {
    return JSON.parse(data) as AgentStreamChunk;
  } catch {
    throw new Error("Remix returned an invalid stream response.");
  }
}

/**
 * The Cloud endpoint speaks the AI SDK's newline-delimited SSE protocol. The
 * SDK's DefaultChatTransport pulls Node-only provider utilities into Metro,
 * so decode only the few events that the mobile UI consumes here instead.
 */
async function* remixStream(
  response: Response,
): AsyncGenerator<AgentStreamChunk> {
  if (!response.body)
    throw new Error("Remix returned an empty stream response.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder
        .decode(value, { stream: !done })
        .replaceAll("\r\n", "\n");

      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const event = eventFromFrame(frame);
        if (event) yield event;
      }

      if (done) break;
    }

    const event = eventFromFrame(buffer);
    if (event) yield event;
  } finally {
    reader.releaseLock();
  }
}

async function requestRemixTurn({
  messages,
  threadId,
  firstTurn,
  keyboardInsertion,
  signal,
}: {
  messages: UIMessage[];
  threadId: string;
  firstTurn: boolean;
  keyboardInsertion: boolean;
  signal: AbortSignal;
}): Promise<Response> {
  const response = await cloud.request("/v2/agent", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: "mobile-remix",
      messages,
      trigger: "submit-message",
      messageId: undefined,
      threadId,
      firstTurn,
      client: {
        ...MOBILE_AGENT_CLIENT,
        // Keyboard Remix can only insert a finished answer into the current
        // text field. It deliberately never receives connected-app tools or
        // their approval cards, which cannot be resolved in the compact IME.
        ...(keyboardInsertion
          ? { supportsKeyboardInsertion: true }
          : { supportsConnectorApprovals: true }),
      },
    }),
    signal,
  });
  if (response.status === 401) throw new CloudAuthError();
  if (response.status === 429) {
    const payload = (await response.json().catch(() => null)) as {
      code?: unknown;
      resetsAt?: unknown;
    } | null;
    if (payload?.code === "rate_limited") {
      throw new CloudRequestError(429, "Too many requests");
    }
    throw new CloudUsageError(
      typeof payload?.resetsAt === "string" ? payload.resetsAt : null,
    );
  }
  if (!response.ok) {
    throw new CloudRequestError(
      response.status,
      await response.text().catch(() => ""),
    );
  }
  return response;
}

export async function runRemixTurn({
  messages,
  threadId,
  firstTurn = false,
  keyboardInsertion = false,
  signal,
  onEvent,
}: {
  messages: UIMessage[];
  threadId: string;
  firstTurn?: boolean;
  /** Only the keyboard can receive the final insertion tool. */
  keyboardInsertion?: boolean;
  signal: AbortSignal;
  onEvent: (event: RemixStreamEvent) => void;
}): Promise<void> {
  const response = await requestRemixTurn({
    messages,
    threadId,
    firstTurn,
    keyboardInsertion,
    signal,
  });
  let completed = false;

  for await (const chunk of remixStream(response)) {
    switch (chunk.type) {
      case "text-delta":
        if (typeof chunk.delta === "string") {
          onEvent({ type: "text", text: chunk.delta });
        }
        break;
      case "tool-input-available":
        if (
          typeof chunk.toolCallId !== "string" ||
          typeof chunk.toolName !== "string"
        ) {
          break;
        }
        if (chunk.toolName === "insert_at_cursor") {
          onEvent({
            type: "tool-result-needed",
            toolCallId: chunk.toolCallId,
            name: "insert_at_cursor",
            input: chunk.input,
          });
        } else {
          onEvent({
            type: "tool",
            toolCallId: chunk.toolCallId,
            name: chunk.toolName,
            input: chunk.input,
          });
        }
        break;
      case "tool-output-available": {
        const output = chunk.output ?? chunk.result;
        if (!output || typeof output !== "object") break;
        const approval = (output as { approval?: unknown }).approval;
        if (!approval || typeof approval !== "object") break;
        const candidate = approval as Partial<PendingConnectorApproval>;
        if (
          typeof candidate.approvalToken === "string" &&
          typeof candidate.toolkit === "string" &&
          typeof candidate.toolkitName === "string" &&
          typeof candidate.toolSlug === "string" &&
          typeof candidate.actionDescription === "string" &&
          typeof candidate.expiresAt === "string"
        ) {
          onEvent({
            type: "connector-approval",
            approval: candidate as PendingConnectorApproval,
          });
        }
        break;
      }
      case "finish":
        completed = true;
        onEvent({ type: "complete" });
        break;
    }
  }

  if (!completed) onEvent({ type: "complete" });
}
