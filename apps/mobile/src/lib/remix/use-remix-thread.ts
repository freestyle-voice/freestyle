import type { UIMessage } from "ai";
import { useCallback, useRef, useState } from "react";

import { runRemixTurn } from "./client";
import { appendAssistantDelta } from "./thread";

export type RemixRunStatus = "idle" | "streaming" | "failed";

function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function useRemixThread() {
  const [threadId, setThreadId] = useState(() => newId("thread"));
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [status, setStatus] = useState<RemixRunStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const newThread = useCallback(() => {
    abortRef.current?.abort();
    setThreadId(newId("thread"));
    setMessages([]);
    setError(null);
    setActiveTool(null);
    setStatus("idle");
  }, []);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || status === "streaming") return false;
      const userMessage: UIMessage = {
        id: newId("user"),
        role: "user",
        parts: [{ type: "text", text: trimmed }],
      };
      const nextMessages = [...messages, userMessage];
      const controller = new AbortController();
      abortRef.current = controller;
      setMessages(nextMessages);
      setStatus("streaming");
      setError(null);
      setActiveTool(null);
      try {
        await runRemixTurn({
          messages: nextMessages,
          threadId,
          firstTurn: messages.length === 0,
          signal: controller.signal,
          onEvent: (event) => {
            if (event.type === "text") {
              setMessages((current) =>
                appendAssistantDelta(current, event.text),
              );
            } else if (event.type === "tool") {
              setActiveTool(event.name.replace(/_/g, " "));
            } else if (event.type === "tool-result-needed") {
              setActiveTool("Preparing a keyboard-ready result");
            }
          },
        });
        setStatus("idle");
        setActiveTool(null);
        return true;
      } catch (cause) {
        if (controller.signal.aborted) {
          setStatus("idle");
          return false;
        }
        setStatus("failed");
        setError(
          cause instanceof Error
            ? cause.message
            : "Remix could not finish that run.",
        );
        return false;
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [messages, status, threadId],
  );

  return {
    threadId,
    messages,
    status,
    error,
    activeTool,
    send,
    stop,
    newThread,
  };
}
