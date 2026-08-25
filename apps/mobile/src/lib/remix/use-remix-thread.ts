import type { UIMessage } from "ai";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  declineConnectorApproval,
  executeConnectorApproval,
} from "@/lib/cloud/connector-approvals";
import { getLatestThread, getThread, runRemixTurn } from "./client";
import { createMobileId } from "./ids";
import { appendAssistantDelta, latestThreadState } from "./thread";
import type { PendingConnectorApproval } from "./types";

export type RemixRunStatus = "idle" | "streaming" | "failed";

function newId(prefix: string): string {
  return createMobileId(prefix);
}

export function useRemixThread() {
  const initialThreadId = useRef(newId("thread"));
  const [threadId, setThreadId] = useState(initialThreadId.current);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [status, setStatus] = useState<RemixRunStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [pendingApproval, setPendingApproval] =
    useState<PendingConnectorApproval | null>(null);
  const [approvalState, setApprovalState] = useState<
    "idle" | "approving" | "approved" | "declining" | "declined" | "failed"
  >("idle");
  const abortRef = useRef<AbortController | null>(null);
  const statusRef = useRef<RemixRunStatus>(status);
  const hydratedRef = useRef(false);
  statusRef.current = status;

  useEffect(() => {
    let cancelled = false;
    void getLatestThread()
      .then((latest) => {
        if (cancelled || hydratedRef.current) return;
        hydratedRef.current = true;
        const next = latestThreadState(latest, initialThreadId.current);
        setThreadId(next.threadId);
        setMessages(next.messages);
      })
      .catch(() => {
        // Home is still useful offline or before sign-in recovers. The next
        // sent turn will create a durable thread with the fallback id.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // A screen unmount or navigation change must stop the underlying fetch as well
  // as discard its UI. Otherwise a late stream chunk can resurrect an assistant
  // message in a different conversation.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      abortRef.current = null;
    },
    [],
  );

  const newThread = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setThreadId(newId("thread"));
    setMessages([]);
    setError(null);
    setActiveTool(null);
    setPendingApproval(null);
    setApprovalState("idle");
    setStatus("idle");
    hydratedRef.current = true;
  }, []);

  const loadThread = useCallback(async (id: string) => {
    if (!id || statusRef.current === "streaming") return false;
    abortRef.current?.abort();
    abortRef.current = null;
    hydratedRef.current = true;
    setStatus("idle");
    setError(null);
    setActiveTool(null);
    setPendingApproval(null);
    setApprovalState("idle");
    try {
      const thread = await getThread(id);
      if (!thread) throw new Error("This conversation is no longer available.");
      setThreadId(thread.id);
      setMessages(thread.messages);
      return true;
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Couldn't load this conversation.",
      );
      return false;
    }
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus("idle");
    setActiveTool(null);
  }, []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      const approvalPending =
        pendingApproval &&
        (approvalState === "idle" ||
          approvalState === "approving" ||
          approvalState === "declining" ||
          approvalState === "failed");
      if (!trimmed || status === "streaming" || approvalPending) return false;
      const userMessage: UIMessage = {
        id: newId("user"),
        role: "user",
        parts: [{ type: "text", text: trimmed }],
      };
      const nextMessages = [...messages, userMessage];
      const controller = new AbortController();
      const assistantId = newId("assistant");
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
            if (abortRef.current !== controller || controller.signal.aborted) {
              return;
            }
            if (event.type === "text") {
              setMessages((current) =>
                appendAssistantDelta(current, event.text, assistantId),
              );
            } else if (event.type === "tool") {
              setActiveTool(event.name.replace(/_/g, " "));
            } else if (event.type === "tool-result-needed") {
              setActiveTool("Preparing a keyboard-ready result");
            } else if (event.type === "connector-approval") {
              setPendingApproval(event.approval);
              setApprovalState("idle");
              setActiveTool(null);
            }
          },
        });
        if (abortRef.current !== controller || controller.signal.aborted) {
          return false;
        }
        setStatus("idle");
        setActiveTool(null);
        return true;
      } catch (cause) {
        if (controller.signal.aborted) {
          if (abortRef.current === controller) setStatus("idle");
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
    [approvalState, messages, pendingApproval, status, threadId],
  );

  const decideApproval = useCallback(
    async (approved: boolean) => {
      if (
        !pendingApproval ||
        approvalState === "approving" ||
        approvalState === "declining"
      )
        return false;
      setApprovalState(approved ? "approving" : "declining");
      try {
        if (approved) {
          await executeConnectorApproval(pendingApproval.approvalToken);
          setApprovalState("approved");
        } else {
          await declineConnectorApproval(pendingApproval.approvalToken);
          setApprovalState("declined");
        }
        return true;
      } catch (cause) {
        setApprovalState("failed");
        setError(
          cause instanceof Error
            ? cause.message
            : "Couldn't resolve this connected-app action.",
        );
        return false;
      }
    },
    [approvalState, pendingApproval],
  );

  return {
    threadId,
    messages,
    status,
    error,
    activeTool,
    pendingApproval,
    approvalState,
    decideApproval,
    send,
    stop,
    newThread,
    loadThread,
  };
}
