import type { UIMessage } from "ai";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  commandDurableTurn,
  getDurableThreadRuntime,
  getDurableTurn,
  sendDurableRemixTurn,
} from "./client";
import { createMobileId } from "./ids";
import { messagesForResend, messagesForRetry } from "./thread";
import type { PendingConnectorApproval } from "./types";

export type RemixRunStatus = "idle" | "streaming" | "failed";

function newId(prefix: string): string {
  return createMobileId(prefix);
}

function approvalNeedsDecision(
  approval: PendingConnectorApproval | null,
  state:
    | "idle"
    | "approving"
    | "approved"
    | "declining"
    | "declined"
    | "failed",
): boolean {
  return Boolean(
    approval &&
      (state === "idle" ||
        state === "approving" ||
        state === "declining" ||
        state === "failed"),
  );
}

export function useRemixThread() {
  // Home is always a new, unsaved draft. The first accepted turn makes this
  // local id durable; prior conversations are opened explicitly.
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
  const activeTurnIdRef = useRef<string | null>(null);
  const retryRequestRef = useRef<{ fingerprint: string; id: string } | null>(
    null,
  );
  const statusRef = useRef<RemixRunStatus>(status);
  statusRef.current = status;

  const applyRuntime = useCallback(
    (
      runtime: NonNullable<Awaited<ReturnType<typeof getDurableThreadRuntime>>>,
    ) => {
      setMessages(runtime.thread.messages);
      const action = runtime.pendingAction;
      if (action?.kind === "connector" && action.status === "pending") {
        setPendingApproval({
          actionId: action.id,
          turnId: action.turnId,
          toolkitName: "Connected app",
          toolSlug: action.toolName,
          actionDescription: action.display,
          expiresAt: action.expiresAt,
        });
        setApprovalState("idle");
      } else {
        setPendingApproval(null);
      }
      if (action?.kind === "desktop" && action.status === "pending") {
        setActiveTool("Waiting for an available desktop");
      }
    },
    [],
  );

  const waitForDurableTurn = useCallback(
    async (
      turnId: string,
      observedThreadId: string,
      controller: AbortController,
    ) => {
      while (!controller.signal.aborted) {
        const [turn, runtime] = await Promise.all([
          getDurableTurn(turnId),
          getDurableThreadRuntime(observedThreadId),
        ]);
        if (runtime) applyRuntime(runtime);
        if (
          turn.status === "queued" ||
          turn.status === "running" ||
          turn.status === "waiting_desktop"
        ) {
          setActiveTool(
            turn.status === "waiting_desktop"
              ? "Waiting for an available desktop"
              : "Remix is working",
          );
        }
        if (turn.status === "waiting_approval") {
          // `claimed` means a device already made an idempotent decision and
          // the server-owned harness is now executing it. Keep observing that
          // same turn rather than treating the approval card's disappearance
          // as completion.
          if (runtime?.pendingAction?.status === "claimed") {
            setActiveTool("Remix is completing the approved action");
          } else {
            setStatus("idle");
            setActiveTool(null);
            return true;
          }
        }
        if (turn.status === "completed") {
          setStatus("idle");
          setActiveTool(null);
          return true;
        }
        if (turn.status === "failed" || turn.status === "needs_desktop") {
          setStatus("failed");
          setActiveTool(null);
          setError(
            turn.error ??
              (turn.status === "needs_desktop"
                ? "This step needs an available Freestyle desktop."
                : "Remix couldn't finish this message."),
          );
          return false;
        }
        if (turn.status === "canceled") {
          setStatus("idle");
          setActiveTool(null);
          return false;
        }
        await new Promise<void>((resolve) => {
          const timeout = setTimeout(resolve, 800);
          controller.signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timeout);
              resolve();
            },
            { once: true },
          );
        });
      }
      return false;
    },
    [applyRuntime],
  );

  const observeActiveTurn = useCallback(
    (
      runtime: NonNullable<Awaited<ReturnType<typeof getDurableThreadRuntime>>>,
    ) => {
      if (!runtime.activeTurn || abortRef.current) return;
      const controller = new AbortController();
      abortRef.current = controller;
      activeTurnIdRef.current = runtime.activeTurn.id;
      setStatus("streaming");
      void waitForDurableTurn(
        runtime.activeTurn.id,
        runtime.thread.id,
        controller,
      ).finally(() => {
        if (abortRef.current === controller) {
          abortRef.current = null;
          activeTurnIdRef.current = null;
        }
      });
    },
    [waitForDurableTurn],
  );

  // Leaving a screen stops only this device's observer. The accepted turn stays
  // on the server; coming back reloads its canonical D1 snapshot instead of
  // silently cancelling work because a view unmounted.
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
    activeTurnIdRef.current = null;
    retryRequestRef.current = null;
  }, []);

  const loadThread = useCallback(
    async (id: string) => {
      if (!id || statusRef.current === "streaming") return false;
      abortRef.current?.abort();
      abortRef.current = null;
      setStatus("idle");
      setError(null);
      setActiveTool(null);
      setPendingApproval(null);
      setApprovalState("idle");
      retryRequestRef.current = null;
      try {
        const runtime = await getDurableThreadRuntime(id);
        if (!runtime)
          throw new Error("This conversation is no longer available.");
        setThreadId(runtime.thread.id);
        applyRuntime(runtime);
        observeActiveTurn(runtime);
        return true;
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Couldn't load this conversation.",
        );
        return false;
      }
    },
    [applyRuntime, observeActiveTurn],
  );

  const stop = useCallback(() => {
    const turnId = activeTurnIdRef.current;
    abortRef.current?.abort();
    abortRef.current = null;
    activeTurnIdRef.current = null;
    if (turnId) {
      void commandDurableTurn(turnId, { type: "cancel" }).catch(() => {
        setError(
          "Stopped on this device, but couldn't cancel Remix on the server. Check this conversation when you're back online.",
        );
      });
    }
    setStatus("idle");
    setActiveTool(null);
  }, []);

  const run = useCallback(
    async (nextMessages: UIMessage[], onTurnAccepted?: () => void) => {
      if (abortRef.current) return false;
      const controller = new AbortController();
      abortRef.current = controller;
      setMessages(nextMessages);
      setStatus("streaming");
      setError(null);
      setActiveTool(null);
      const fingerprint = JSON.stringify({ threadId, messages: nextMessages });
      const clientRequestId =
        retryRequestRef.current?.fingerprint === fingerprint
          ? retryRequestRef.current.id
          : newId("turn");
      retryRequestRef.current = { fingerprint, id: clientRequestId };
      let turnAccepted = false;
      try {
        const turn = await sendDurableRemixTurn({
          messages: nextMessages,
          threadId,
          firstTurn: nextMessages.length === 1,
          clientRequestId,
        });
        turnAccepted = true;
        onTurnAccepted?.();
        activeTurnIdRef.current = turn.id;
        const completed = await waitForDurableTurn(
          turn.id,
          threadId,
          controller,
        );
        if (abortRef.current !== controller || controller.signal.aborted) {
          return false;
        }
        // A terminal durable result should not be reused for an intentional
        // retry. Keep the key only when the request/polling connection failed
        // before this device could learn the server-owned outcome.
        retryRequestRef.current = null;
        return completed;
      } catch (cause) {
        if (controller.signal.aborted) {
          if (abortRef.current === controller) setStatus("idle");
          return false;
        }
        setStatus("failed");
        setError(
          cause instanceof Error && cause.message
            ? `Connection interrupted. ${cause.message}`
            : "Connection interrupted. Retry this message when you're back online.",
        );
        if (!turnAccepted) {
          // Preserve this exact key for Retry: Cloud may already have accepted
          // the request even though the response never reached the device.
          retryRequestRef.current = { fingerprint, id: clientRequestId };
        }
        return false;
      } finally {
        if (abortRef.current === controller) {
          abortRef.current = null;
          activeTurnIdRef.current = null;
        }
      }
    },
    [threadId, waitForDurableTurn],
  );

  const send = useCallback(
    async (text: string, onTurnAccepted?: () => void) => {
      const trimmed = text.trim();
      const approvalPending = approvalNeedsDecision(
        pendingApproval,
        approvalState,
      );
      if (!trimmed || status === "streaming" || approvalPending) return false;
      const userMessage: UIMessage = {
        id: newId("user"),
        role: "user",
        parts: [{ type: "text", text: trimmed }],
      };
      const nextMessages = [...messages, userMessage];
      return run(nextMessages, onTurnAccepted);
    },
    [approvalState, messages, pendingApproval, run, status],
  );

  const retryLastTurn = useCallback(async () => {
    if (
      status === "streaming" ||
      approvalNeedsDecision(pendingApproval, approvalState)
    )
      return false;
    const nextMessages = messagesForRetry(messages);
    return nextMessages ? run(nextMessages) : false;
  }, [approvalState, messages, pendingApproval, run, status]);

  const resend = useCallback(
    async (messageId: string, text: string, onTurnAccepted?: () => void) => {
      if (
        status === "streaming" ||
        approvalNeedsDecision(pendingApproval, approvalState)
      )
        return false;
      const nextMessages = messagesForResend(messages, messageId, text);
      return nextMessages ? run(nextMessages, onTurnAccepted) : false;
    },
    [approvalState, messages, pendingApproval, run, status],
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
        if (!pendingApproval.actionId || !pendingApproval.turnId) {
          throw new Error("This approval is no longer available.");
        }
        await commandDurableTurn(pendingApproval.turnId, {
          type: approved ? "approve" : "decline",
          actionId: pendingApproval.actionId,
        });
        setApprovalState(approved ? "approved" : "declined");
        const controller = new AbortController();
        abortRef.current = controller;
        activeTurnIdRef.current = pendingApproval.turnId;
        setStatus("streaming");
        await waitForDurableTurn(pendingApproval.turnId, threadId, controller);
        if (abortRef.current === controller) {
          abortRef.current = null;
          activeTurnIdRef.current = null;
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
    [approvalState, pendingApproval, threadId, waitForDurableTurn],
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
    resend,
    retryLastTurn,
    stop,
    newThread,
    loadThread,
  };
}
