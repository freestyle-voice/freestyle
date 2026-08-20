import {
  CloudAuthError,
  CloudRequestError,
  CloudUsageError,
} from "@freestyle-voice/utils/cloud";
import { DefaultChatTransport, type UIMessage } from "ai";

import { cloud } from "@/lib/cloud/client";

import type {
  RemixStreamEvent,
  RemixThreadOrigin,
  RemixThreadPage,
} from "./types";

const THREAD_PAGE_SIZE = 24;

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

function remixTransport(
  threadId: string,
  firstTurn: boolean,
): DefaultChatTransport<UIMessage> {
  return new DefaultChatTransport({
    api: "/v2/agent",
    body: { threadId, firstTurn },
    fetch: async (_input, init) => {
      const response = await cloud.request("/v2/agent", {
        method: init?.method ?? "POST",
        headers: init?.headers,
        body: init?.body,
        signal: init?.signal,
      });
      if (response.status === 401) throw new CloudAuthError();
      if (response.status === 429) {
        const payload = (await response.json().catch(() => null)) as {
          resetsAt?: unknown;
        } | null;
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
    },
  });
}

export async function runRemixTurn({
  messages,
  threadId,
  firstTurn = false,
  signal,
  onEvent,
}: {
  messages: UIMessage[];
  threadId: string;
  firstTurn?: boolean;
  signal: AbortSignal;
  onEvent: (event: RemixStreamEvent) => void;
}): Promise<void> {
  const stream = await remixTransport(threadId, firstTurn).sendMessages({
    chatId: "mobile-remix",
    messages,
    abortSignal: signal,
    trigger: "submit-message",
    messageId: undefined,
  });
  let completed = false;

  for await (const chunk of stream) {
    switch (chunk.type) {
      case "text-delta":
        onEvent({ type: "text", text: chunk.delta });
        break;
      case "tool-input-available":
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
      case "finish":
        completed = true;
        onEvent({ type: "complete" });
        break;
    }
  }

  if (!completed) onEvent({ type: "complete" });
}
