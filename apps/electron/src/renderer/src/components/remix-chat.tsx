import { useChat } from "@ai-sdk/react";
import { REMIX_PRESETS, type RemixPreset } from "@freestyle-voice/validations";
import { AgentMessageQueueControls } from "@renderer/components/agent-message-queue";
import { AgentActivity } from "@renderer/components/agents/agent-activity";
import type { AgentActivityItem } from "@renderer/components/agents/agent-activity/types";
import { AgentDisclosure } from "@renderer/components/agents/agent-disclosure";
import { ThinkingShimmer } from "@renderer/components/agents/loading-states/thinking-shimmer";
import { MessageScroller } from "@renderer/components/agents/message-scroller";
import { useAgentMessageQueue } from "@renderer/lib/agent-message-queue";
import {
  type AgentToolCall,
  agentToolTier,
  DECLINED_OUTPUT,
  describeAgentAction,
  executeAgentTool,
  reportAgentToolResult,
  requestAgentFileSaveGrant,
} from "@renderer/lib/agent-tools";
import { capture } from "@renderer/lib/analytics";
import { apiFetch, initApiBase } from "@renderer/lib/api";
import { executeRemixTool } from "@renderer/lib/remix-tool-executor";
import {
  cancelDurableTurn,
  getThread,
  getThreadRuntime,
} from "@renderer/lib/threads";
import {
  DefaultChatTransport,
  type DynamicToolUIPart,
  getToolOrDynamicToolName,
  isTextUIPart,
  isToolOrDynamicToolUIPart,
  lastAssistantMessageIsCompleteWithToolCalls,
  type ToolUIPart,
  type UIMessage,
} from "ai";
import { LoaderCircle } from "lucide-react";
import { domMax, LazyMotion } from "motion/react";
import type React from "react";
import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { RemixSelectionPayload } from "../../../shared/remix";
import { FreestyleMark } from "./freestyle-mark";
import {
  REMIX_CHAT_STRIP,
  REMIX_CHAT_SURFACE,
  type RemixChatAnchor,
} from "./remix-chat-surface";

const INK = "rgba(245, 241, 228, 0.92)";
const INK_DIM = "rgba(245, 241, 228, 0.70)";
const INK_FAINT = "rgba(245, 241, 228, 0.52)";
const OLIVE = "#8AB62A";
const REMIX_THINKING_MESSAGES = [
  "Thinking…",
  "Contemplating…",
  "Finding the right thread…",
  "One moment — bringing it together…",
] as const;

export {
  REMIX_CHAT_STRIP,
  REMIX_CHAT_SURFACE,
  type RemixChatAnchor,
} from "./remix-chat-surface";

function anchoredLayerStyle(
  anchor: RemixChatAnchor,
  size: { width: number; height: number },
): React.CSSProperties {
  return {
    position: "absolute",
    width: size.width,
    height: size.height,
    ...(anchor.v === "top" ? { top: 0 } : { bottom: 0 }),
    ...(anchor.h === "right"
      ? { right: 0 }
      : { left: "50%", transform: "translateX(-50%)" }),
  };
}

interface ThreadState {
  id: string;
  messages: UIMessage[];
}

export interface RemixQueuedInstruction {
  id: number;
  text: string;
}

export type RemixChatVoiceStatus = "listening" | "transcribing" | null;

export interface RemixChatActivity {
  working: boolean;
  label: string | null;
}

export interface RemixChatProps {
  context: RemixSelectionPayload;
  initialInstruction: string | null;
  queuedInstructions: RemixQueuedInstruction[];
  voiceStatus: RemixChatVoiceStatus;
  voiceTranscript: string | null;
  voiceNotice: string | null;
  minimized: boolean;
  onMiniHeightChange?: (height: number) => void;
  anchor: RemixChatAnchor;
  onOpenWorkspace: (threadId: string) => void;
  onInstructionConsumed: (instructionId: number) => void;
  onVoiceNoticeDismiss: () => void;
  onActivityChange: (activity: RemixChatActivity) => void;
  onCancelActive: (cancel: (() => void) | null) => void;
  onExpand: () => void;
  onMinimize: () => void;
  onClose: () => void;
}

export function RemixChat(props: RemixChatProps): React.JSX.Element {
  const [thread, setThread] = useState<ThreadState>(() => ({
    id: crypto.randomUUID(),
    messages: [],
  }));
  // State (not props) so "New" can clear it without a remount re-sending.
  const [initialInstruction, setInitialInstruction] = useState(
    props.initialInstruction,
  );

  useEffect(() => {
    if (props.initialInstruction) {
      setInitialInstruction(props.initialInstruction);
    }
  }, [props.initialInstruction]);

  const startNewThread = useCallback(() => {
    setInitialInstruction(null);
    setThread({ id: crypto.randomUUID(), messages: [] });
  }, []);
  return (
    <RemixThread
      key={thread.id}
      thread={thread}
      context={props.context}
      initialInstruction={initialInstruction}
      queuedInstructions={props.queuedInstructions}
      voiceStatus={props.voiceStatus}
      voiceTranscript={props.voiceTranscript}
      voiceNotice={props.voiceNotice}
      minimized={props.minimized}
      anchor={props.anchor}
      onOpenWorkspace={props.onOpenWorkspace}
      onInstructionConsumed={props.onInstructionConsumed}
      onVoiceNoticeDismiss={props.onVoiceNoticeDismiss}
      onActivityChange={props.onActivityChange}
      onCancelActive={props.onCancelActive}
      onExpand={props.onExpand}
      onMinimize={props.onMinimize}
      onClose={props.onClose}
      onNewThread={startNewThread}
      onMiniHeightChange={props.onMiniHeightChange}
    />
  );
}

interface RemixThreadProps {
  thread: ThreadState;
  context: RemixSelectionPayload;
  initialInstruction: string | null;
  queuedInstructions: RemixQueuedInstruction[];
  voiceStatus: RemixChatVoiceStatus;
  voiceTranscript: string | null;
  voiceNotice: string | null;
  minimized: boolean;
  anchor: RemixChatAnchor;
  onOpenWorkspace: (threadId: string) => void;
  onInstructionConsumed: (instructionId: number) => void;
  onVoiceNoticeDismiss: () => void;
  onActivityChange: (activity: RemixChatActivity) => void;
  onCancelActive: (cancel: (() => void) | null) => void;
  onExpand: () => void;
  onMinimize: () => void;
  onClose: () => void;
  onNewThread: () => void;
  onMiniHeightChange?: (height: number) => void;
}

interface ActionRow {
  id: number;
  label: string;
  status: "running" | "done" | "failed";
  detail?: string;
}

interface PendingApproval {
  call: AgentToolCall;
}

const MINIMIZE_GRACE_MS = 380;
const MINI_STRIP_HEADER_HEIGHT = 44;
const MINI_STRIP_MAX = 316; // main's 340 window cap minus the chrome

function RemixThread(props: RemixThreadProps): React.JSX.Element {
  const { thread, minimized, anchor, onMinimize, onClose } = props;
  const [input, setInput] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [approvals, setApprovals] = useState<PendingApproval[]>([]);
  const [resolvingApprovalId, setResolvingApprovalId] = useState<string | null>(
    null,
  );
  // State updates are asynchronous; this ref closes the small window where
  // two rapid clicks could otherwise start two destructive local actions.
  const resolvingApprovalRef = useRef<string | null>(null);
  // Electron can report a window-level mouseout while the transparent pill is
  // resizing beneath a stationary cursor. Keep this synchronously updated so
  // the dismissal guard never waits for React to commit hover state.
  const pointerOverChatRef = useRef(false);
  const actionSeqRef = useRef(0);

  const contextRef = useRef<RemixSelectionPayload>(props.context);
  const [liveContext, setLiveContext] = useState<RemixSelectionPayload>(
    props.context,
  );
  useEffect(() => {
    contextRef.current = props.context;
    setLiveContext(props.context);
  }, [props.context]);
  const lastInstructionRef = useRef<string>("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport<UIMessage>({
        api: "/api/agent",

        fetch: (async (_input: unknown, init?: RequestInit) => {
          // The pill is often the first renderer to contact the server after
          // launch. Resolve the configured target before its first agent turn.
          await initApiBase();
          const res = await apiFetch("/api/agent", init ?? {});
          if (res.status === 401) {
            void window.api?.cloudPromptSignIn?.();
            throw new Error("Sign in to Freestyle Cloud to use Remix.");
          }
          if (res.status === 429) {
            void window.api?.cloudPromptUpgrade?.();
            throw new Error("You've hit this week's free limit.");
          }
          if (!res.ok) {
            const body = (await res.json().catch(() => null)) as {
              detail?: string;
            } | null;
            throw new Error(body?.detail || `Remix failed (${res.status}).`);
          }
          return res;
        }) as typeof fetch,
        prepareSendMessagesRequest: ({ messages }) => ({
          body: {
            messages,
            threadId: thread.id,
            ...(messages.length <= 1 ? { firstTurn: true } : {}),
            context: {
              selection: contextRef.current.text,
              appName: contextRef.current.appName,
              windowTitle: contextRef.current.windowTitle,
              clipboard: contextRef.current.clipboard ?? null,
              clipboardLength: contextRef.current.clipboardLength ?? 0,
              capturedAt: contextRef.current.capturedAt,
            },
          },
        }),
      }),
    [thread.id],
  );

  const {
    messages,
    sendMessage,
    addToolResult,
    status,
    stop,
    clearError,
    setMessages,
    resumeStream,
  } = useChat<UIMessage>({
    id: thread.id,
    messages: thread.messages,
    transport,
    resume: true,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onToolCall: async ({ toolCall }) => {
      const call: AgentToolCall = {
        toolName: toolCall.toolName,
        toolCallId: toolCall.toolCallId,
        input: toolCall.input,
      };
      const startedAt = Date.now();
      const tier = await agentToolTier(call);
      if (tier === "confirmed") {
        props.onExpand();
        setApprovals((pending) =>
          pending.some((item) => item.call.toolCallId === call.toolCallId)
            ? pending
            : [...pending, { call }],
        );
        return;
      }
      const output =
        tier === "free"
          ? await executeAgentTool(call)
          : await executeRemixTool(call, {
              onContext: (context) => {
                contextRef.current = context;
                setLiveContext(context);
              },
            });
      if (tier !== null) reportAgentToolResult(call, output, startedAt);
      void addToolResult({
        tool: getToolOrDynamicToolName(toolCall as never) as never,
        toolCallId: (toolCall as { toolCallId: string }).toolCallId,
        output,
      });
    },
    onFinish: () => {
      // The workspace may have been opened while this pill request was in
      // flight. It observes the persisted Cloud thread, so notify it only
      // after this response has completed rather than making navigation
      // depend on a transient renderer stream.
      window.api?.remixThreadUpdated?.(thread.id);
    },
    onError: (err) => {
      setNotice(err.message || "Remix failed.");
    },
  });

  const resolveApproval = useCallback(
    (approval: PendingApproval, allowed: boolean) => {
      const call = approval.call;
      if (resolvingApprovalRef.current) return;
      capture("approval_resolved", { tool: call.toolName, allowed });
      resolvingApprovalRef.current = call.toolCallId;
      setResolvingApprovalId(call.toolCallId);
      void (async () => {
        const startedAt = Date.now();
        let output: Record<string, unknown>;
        try {
          const grant =
            allowed && call.toolName === "save_file"
              ? await requestAgentFileSaveGrant(call)
              : null;
          output = !allowed
            ? DECLINED_OUTPUT
            : grant && grant.ok !== true
              ? grant
              : await executeAgentTool(call, {
                  saveFileGrant:
                    grant && typeof grant.grant === "string"
                      ? grant.grant
                      : undefined,
                });
        } catch (error) {
          output = {
            ok: false,
            reason: "tool-failed",
            detail: error instanceof Error ? error.message : String(error),
          };
        }
        reportAgentToolResult(call, output, startedAt);
        setApprovals((pending) =>
          pending.filter((item) => item.call.toolCallId !== call.toolCallId),
        );
        resolvingApprovalRef.current = null;
        setResolvingApprovalId(null);
        void addToolResult({
          tool: call.toolName as never,
          toolCallId: call.toolCallId,
          output,
        });
      })();
    },
    [addToolResult],
  );

  const busy = status === "submitted" || status === "streaming";
  const queue = useAgentMessageQueue(thread.id);
  const queueWasActiveRef = useRef(false);
  const queueInitializedRef = useRef(false);
  const queueHadItemsRef = useRef(false);
  const queueNeedsRefreshRef = useRef(false);
  const queueThreadRef = useRef(thread.id);
  useEffect(() => {
    if (queueThreadRef.current === thread.id) return;
    queueThreadRef.current = thread.id;
    queueWasActiveRef.current = false;
    queueInitializedRef.current = false;
    queueHadItemsRef.current = false;
    queueNeedsRefreshRef.current = false;
  }, [thread.id]);
  useEffect(() => {
    // The first observation is commonly the same stream that `resume: true`
    // already attached to during a pill/workspace handoff. Only a later idle
    // → active change belongs to a server-drained queued message.
    if (!queueInitializedRef.current) {
      queueInitializedRef.current = true;
      queueWasActiveRef.current = queue.active;
      return;
    }
    if (!queue.active) {
      queueWasActiveRef.current = false;
      return;
    }
    if (busy || queueWasActiveRef.current) return;
    queueWasActiveRef.current = true;
    void getThread(thread.id)
      .then((next) => {
        if (next) setMessages(next.messages);
        return resumeStream();
      })
      .catch(() => setNotice("Couldn’t resume the queued message."));
  }, [busy, queue.active, resumeStream, setMessages, thread.id]);
  useEffect(() => {
    const hasItems = queue.items.length > 0;
    if (queueHadItemsRef.current && !hasItems)
      queueNeedsRefreshRef.current = true;
    queueHadItemsRef.current = hasItems;
    // A very short server-owned follow-up may finish between queue polls, so
    // there is no active stream for `resumeStream()` to attach to. Refresh the
    // canonical thread once the entry leaves the queue in that case.
    if (!queueNeedsRefreshRef.current || queue.active || busy) return;
    queueNeedsRefreshRef.current = false;
    void getThread(thread.id)
      .then((next) => {
        if (next) setMessages(next.messages);
      })
      .catch(() => {});
  }, [busy, queue.active, queue.items.length, setMessages, thread.id]);
  const dispatchInFlightRef = useRef(false);
  const cancellationRequestedRef = useRef(false);
  const sawBusySinceDispatchRef = useRef(false);
  const dispatchInstruction = useCallback(
    (text: string, source: "dictated" | "typed") => {
      // Each message gets its own cancellation lifecycle. Without resetting
      // this guard, a second Remix turn could no longer be stopped.
      cancellationRequestedRef.current = false;
      dispatchInFlightRef.current = true;
      setNotice(null);
      props.onVoiceNoticeDismiss();
      clearError();
      lastInstructionRef.current = text;
      void sendMessage({ text }).catch((err) => {
        // A request that fails before useChat reaches `submitted` used to
        // leave this guard set forever, so the next spoken instruction stayed
        // queued behind a request that no longer existed.
        dispatchInFlightRef.current = false;
        setNotice(err instanceof Error ? err.message : "Remix failed.");
      });
      capture("remix_message_sent", { source });
    },
    [clearError, props.onVoiceNoticeDismiss, sendMessage],
  );

  useEffect(() => {
    if (busy) {
      sawBusySinceDispatchRef.current = true;
      return;
    }
    if (sawBusySinceDispatchRef.current) {
      dispatchInFlightRef.current = false;
      sawBusySinceDispatchRef.current = false;
    }
  }, [busy]);

  const hasAssistantResponse = useMemo(
    () =>
      messages.some(
        (message) =>
          message.role === "assistant" &&
          message.parts.some(
            (part) =>
              (isTextUIPart(part) && part.text.trim().length > 0) ||
              (isToolOrDynamicToolUIPart(part) &&
                part.state !== "output-available" &&
                part.state !== "output-error"),
          ),
      ),
    [messages],
  );
  const actionRunning = actions.some((action) => action.status === "running");
  const waitingForApproval = approvals.length > 0;
  // A spoken follow-up begins while the cursor is still in the app the user
  // was working in. That must not be treated as intent to collapse the chat:
  // keep the full surface stable until voice capture and the agent turn end.
  const hasActiveTurn =
    props.voiceStatus !== null ||
    busy ||
    actionRunning ||
    waitingForApproval ||
    resolvingApprovalId !== null ||
    props.queuedInstructions.length > 0;
  const activeTurnRef = useRef(hasActiveTurn);
  activeTurnRef.current = hasActiveTurn;
  const onActivityChangeRef = useRef(props.onActivityChange);
  onActivityChangeRef.current = props.onActivityChange;
  const activity = useMemo<RemixChatActivity>(
    () => ({
      working: busy || actionRunning || waitingForApproval,
      // `useChat` correctly remains streaming while a client tool waits for
      // its result. The approval state is more actionable than that generic
      // streaming label for the pill and companion, so it must win here.
      label: waitingForApproval
        ? "Waiting for your approval"
        : busy
          ? agentProgressLabel(messages, busy)
          : (actions.find((action) => action.status === "running")?.label ??
            null),
    }),
    [actionRunning, actions, busy, messages, waitingForApproval],
  );
  useEffect(() => {
    props.onActivityChange(activity);
  }, [activity, props.onActivityChange]);
  useEffect(
    () => () => {
      onActivityChangeRef.current({ working: false, label: null });
    },
    [],
  );

  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (busy) {
      setSettled(false);
      return;
    }
    const timer = setTimeout(() => setSettled(true), 450);
    return () => clearTimeout(timer);
  }, [busy]);

  const stopRef = useRef(stop);
  stopRef.current = stop;
  useEffect(() => {
    const off = window.api?.onRemixObserverHandoff?.((threadId) => {
      if (threadId !== thread.id) return;
      // This only detaches the pill's HTTP observer. The local server owns
      // the upstream Cloud reader, so the workspace can resume safely.
      stopRef.current();
    });
    return () => off?.();
  }, [thread.id]);
  useEffect(
    () => () => {
      void stopRef.current();
    },
    [],
  );

  const cancelActiveTurn = useCallback(() => {
    if (cancellationRequestedRef.current) return;
    cancellationRequestedRef.current = true;
    void stop();
    // Stream abort is immediate. If this request has a durable Cloud turn,
    // cancel it too so it cannot keep invoking tools after the pill closes.
    void getThreadRuntime(thread.id)
      .then((runtime) => {
        if (runtime?.activeTurn) {
          return cancelDurableTurn(runtime.activeTurn.id);
        }
        return undefined;
      })
      .catch(() => {});
  }, [stop, thread.id]);
  useEffect(() => {
    props.onCancelActive(cancelActiveTurn);
    return () => props.onCancelActive(null);
  }, [cancelActiveTurn, props.onCancelActive]);

  // Guard so the opening instruction is sent exactly once.
  const sentInitialRef = useRef(false);
  useEffect(() => {
    if (sentInitialRef.current) return;
    const instruction = props.initialInstruction?.trim();
    if (!instruction) return;
    sentInitialRef.current = true;
    dispatchInstruction(instruction, "dictated");
  }, [dispatchInstruction, props.initialInstruction]);

  useEffect(() => {
    if (busy || dispatchInFlightRef.current) return;
    const instruction = props.queuedInstructions[0];
    if (!instruction?.text.trim()) return;
    props.onInstructionConsumed(instruction.id);
    dispatchInstruction(instruction.text.trim(), "dictated");
  }, [
    busy,
    dispatchInstruction,
    props.onInstructionConsumed,
    props.queuedInstructions,
  ]);

  // Seed from restored thread so reloaded history never recounts tools.
  const seenToolCallsRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    let seen = seenToolCallsRef.current;
    if (!seen) {
      seen = new Set<string>();
      for (const message of thread.messages) {
        for (const part of message.parts) {
          if (isToolOrDynamicToolUIPart(part)) seen.add(part.toolCallId);
        }
      }
      seenToolCallsRef.current = seen;
    }
    for (const message of messages) {
      if (message.role !== "assistant") continue;
      for (const part of message.parts) {
        if (!isToolOrDynamicToolUIPart(part)) continue;
        if (seen.has(part.toolCallId)) continue;
        seen.add(part.toolCallId);
        capture("remix_tool_used", { tool: getToolOrDynamicToolName(part) });
      }
    }
  }, [messages, thread.messages]);

  // Document-level mouseout: element leave is lost when rows reflow under the
  // cursor. Grace timer distinguishes leave from edge graze; a draft pins open.
  const minimizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearMinimizeTimer = useCallback(() => {
    if (minimizeTimerRef.current) {
      clearTimeout(minimizeTimerRef.current);
      minimizeTimerRef.current = null;
    }
  }, []);
  useEffect(() => clearMinimizeTimer, [clearMinimizeTimer]);
  const handleMouseEnter = useCallback(() => {
    pointerOverChatRef.current = true;
    clearMinimizeTimer();
  }, [clearMinimizeTimer]);
  const handleMouseLeave = useCallback(() => {
    pointerOverChatRef.current = false;
  }, []);
  useEffect(() => {
    if (minimized) return;
    const handleOver = (): void => {
      clearMinimizeTimer();
      document.removeEventListener("mouseover", handleOver);
    };
    const handleOut = (event: MouseEvent): void => {
      if (event.relatedTarget) return;
      if (pointerOverChatRef.current) return;
      if (activeTurnRef.current) return;
      if (inputRef.current?.value.trim()) return;
      clearMinimizeTimer();
      minimizeTimerRef.current = setTimeout(() => {
        minimizeTimerRef.current = null;
        document.removeEventListener("mouseover", handleOver);
        if (pointerOverChatRef.current) return;
        if (activeTurnRef.current) return;
        onMinimize();
      }, MINIMIZE_GRACE_MS);
      document.addEventListener("mouseover", handleOver);
    };
    document.addEventListener("mouseout", handleOut);
    return () => {
      document.removeEventListener("mouseout", handleOut);
      document.removeEventListener("mouseover", handleOver);
    };
  }, [minimized, onMinimize, clearMinimizeTimer]);

  useEffect(() => {
    if (minimized) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      cancelActiveTurn();
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [cancelActiveTurn, minimized, onClose]);

  const miniMessageRef = useRef<HTMLDivElement | null>(null);
  const [miniContentHeight, setMiniContentHeight] = useState<number | null>(
    null,
  );
  const finalText = useMemo(() => {
    if (busy) return null;
    for (let i = messages.length - 1; i >= 0; i--) {
      const message = messages[i];
      if (message.role !== "assistant") continue;
      const text = message.parts
        .filter(isTextUIPart)
        .map((part) => part.text)
        .join("")
        .trim();
      return text || null;
    }
    return null;
  }, [messages, busy]);
  const voiceLabel =
    props.voiceStatus === "listening"
      ? props.voiceTranscript?.trim()
        ? `Listening: ${props.voiceTranscript.trim()}`
        : "Listening…"
      : props.voiceStatus === "transcribing"
        ? "Transcribing…"
        : null;
  const displayNotice = notice ?? props.voiceNotice;
  const miniProgress =
    voiceLabel ??
    (waitingForApproval ? "Approval needed" : null) ??
    agentProgressLabel(messages, busy) ??
    actions.find((action) => action.status === "running")?.label ??
    null;
  // Capture has a clear product identity; active work should lead with the
  // live action instead of a label that does not explain what is happening.
  const miniIdentityLabel =
    props.voiceStatus === null ? (miniProgress ?? "Remix") : "Remix";
  const miniSecondaryProgress =
    props.voiceStatus === null ? null : miniProgress;
  // Voice capture remains clearly branded, while an active agent turn should
  // describe what it is doing instead of repeating the product name.
  const headerActivity =
    props.voiceStatus === null
      ? ((waitingForApproval ? "Approval needed" : null) ??
        agentProgressLabel(messages, busy) ??
        actions.find((action) => action.status === "running")?.label ??
        null)
      : null;
  const showFullFinal =
    minimized &&
    settled &&
    displayNotice === null &&
    props.voiceStatus === null &&
    finalText !== null;
  const miniStripHeight = showFullFinal
    ? Math.min(
        Math.max(
          miniContentHeight ?? REMIX_CHAT_STRIP.height,
          REMIX_CHAT_STRIP.height,
        ),
        MINI_STRIP_MAX,
      )
    : REMIX_CHAT_STRIP.height;

  const onMiniHeightChangeRef = useRef(props.onMiniHeightChange);
  onMiniHeightChangeRef.current = props.onMiniHeightChange;
  useEffect(() => {
    onMiniHeightChangeRef.current?.(miniStripHeight);
  }, [miniStripHeight]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: finalText re-runs the measurement when a new final message lands in the same settled state
  useLayoutEffect(() => {
    if (!minimized) return;
    if (!showFullFinal) {
      setMiniContentHeight(null);
      return;
    }
    const el = miniMessageRef.current;
    if (!el) return;
    setMiniContentHeight(el.scrollHeight + MINI_STRIP_HEADER_HEIGHT);
  }, [minimized, showFullFinal, finalText]);

  const refreshContext = useCallback(async () => {
    try {
      const re = await window.api.remixRecapture();
      if (re && !re.stale) {
        contextRef.current = {
          // Null can mean empty highlight or a slow reply — keep last known.
          text: re.selection ?? contextRef.current.text,
          appName: re.appName,
          windowTitle: re.windowTitle,
          url: re.url ?? null,
          clipboard: re.clipboard ?? contextRef.current.clipboard ?? null,
          clipboardLength:
            re.clipboardLength ?? contextRef.current.clipboardLength ?? 0,
          capturedAt: re.capturedAt,
        };
        setLiveContext(contextRef.current);
      }
    } catch {
      // Keep last context.
    }
  }, []);

  const sendText = useCallback(
    (text: string) => {
      dispatchInstruction(text, "typed");
    },
    [dispatchInstruction],
  );

  const submit = useCallback(() => {
    const text = input.trim();
    if (!text || dispatchInFlightRef.current) return;
    setInput("");
    const el = inputRef.current;
    if (el) el.style.height = "auto";
    if (busy) {
      const context = contextRef.current;
      void queue
        .enqueue(text, {
          selection: context.text,
          appName: context.appName,
          windowTitle: context.windowTitle,
          clipboard: context.clipboard ?? null,
          clipboardLength: context.clipboardLength ?? 0,
          capturedAt: context.capturedAt,
        })
        .catch(() => setNotice("Couldn’t queue that message."));
      capture("remix_message_queued", { source: "typed" });
      return;
    }
    void sendText(text);
  }, [busy, input, queue, sendText]);

  const presetRunningRef = useRef(false);
  const runPresetTransform = useCallback(async (preset: RemixPreset) => {
    const selection = contextRef.current.text;
    if (!selection) return;
    capture("remix_message_sent", { source: "preset", preset: preset.id });
    const id = ++actionSeqRef.current;
    setActions((rows) => [
      ...rows,
      { id, label: preset.label, status: "running" },
    ]);
    const settle = (patch: Partial<ActionRow>): void =>
      setActions((rows) =>
        rows.map((row) => (row.id === id ? { ...row, ...patch } : row)),
      );
    try {
      const res = await apiFetch("/api/remix/transform", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: selection,
          remixId: preset.id,
          appName: contextRef.current.appName,
        }),
      });
      if (res.status === 401) {
        void window.api?.cloudPromptSignIn?.();
        throw new Error("Sign in to Freestyle Cloud first.");
      }
      if (res.status === 429) {
        void window.api?.cloudPromptUpgrade?.();
        throw new Error("You've hit this week's free limit.");
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          detail?: string;
        } | null;
        throw new Error(body?.detail || `Remix failed (${res.status}).`);
      }
      const data = (await res.json()) as { text?: string };
      const edited = (data.text ?? "").trim();
      if (!edited) throw new Error("The model returned nothing.");
      const delivered = await window.api.remixPasteText(edited);
      if (!delivered.ok) {
        throw new Error("Couldn't replace it — nothing was changed.");
      }

      contextRef.current = { ...contextRef.current, text: edited };
      settle({ status: "done" });
    } catch (err) {
      settle({
        status: "failed",
        detail: err instanceof Error ? err.message : "Something went wrong.",
      });
    }
  }, []);

  const runPreset = useCallback(
    async (preset: RemixPreset) => {
      if (busy || presetRunningRef.current) return;
      presetRunningRef.current = true;
      try {
        await refreshContext();
        const selection = contextRef.current.text;
        if (!selection) {
          setNotice("Nothing is highlighted — select some text first.");
          return;
        }
        await runPresetTransform(preset);
      } finally {
        presetRunningRef.current = false;
      }
    },
    [busy, refreshContext, runPresetTransform],
  );

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: hover cancels minimize; Esc closes
    <div
      className="remix-chat dark"
      data-minimized={minimized}
      data-testid={minimized ? "remix-chat-mini" : "remix-chat"}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <style>{REMIX_CHAT_CSS}</style>
      {/* domMax for layout projection; strict requires m.* not motion.* */}
      <LazyMotion features={domMax} strict>
        <div
          className="remix-chat-face remix-chat-face-strip"
          style={anchoredLayerStyle(anchor, {
            width: REMIX_CHAT_STRIP.width,
            height: miniStripHeight,
          })}
          aria-hidden={!minimized}
        >
          <div className="remix-mini" data-full={showFullFinal}>
            <div className="remix-mini-head">
              <span className="remix-mini-identity">
                <span
                  className="remix-mini-dot"
                  data-busy={busy || !settled || miniProgress !== null}
                  data-failed={displayNotice !== null}
                />
                <span>{miniIdentityLabel}</span>
              </span>
              {miniSecondaryProgress ? (
                <span className="remix-mini-progress" aria-hidden="true">
                  {miniSecondaryProgress}
                </span>
              ) : null}
              <span className="remix-mini-actions">
                <button
                  type="button"
                  className="remix-mini-icon"
                  onClick={() => props.onOpenWorkspace(thread.id)}
                  aria-label="Open Remix workspace"
                  title="Open Remix workspace"
                >
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 12 12"
                    aria-hidden="true"
                  >
                    <path
                      d="M7 1h4v4M11 1 6.5 5.5M5 2H2.5A1.5 1.5 0 0 0 1 3.5v6A1.5 1.5 0 0 0 2.5 11h6A1.5 1.5 0 0 0 10 9.5V7"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <button
                  type="button"
                  className="remix-mini-icon"
                  onClick={() => {
                    cancelActiveTurn();
                    onClose();
                  }}
                  aria-label="Close Remix"
                  title="Close Remix"
                >
                  <svg
                    width="11"
                    height="11"
                    viewBox="0 0 10 10"
                    aria-hidden="true"
                  >
                    <path
                      d="M2 2l6 6M8 2l-6 6"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>
              </span>
            </div>
            {showFullFinal ? (
              <div className="remix-mini-message" ref={miniMessageRef}>
                <Markdown text={finalText ?? ""} />
              </div>
            ) : null}
          </div>
        </div>

        <div
          className="remix-chat-face remix-chat-face-full"
          style={anchoredLayerStyle(anchor, REMIX_CHAT_SURFACE)}
          aria-hidden={minimized}
        >
          <div className="remix-chat-head">
            {headerActivity ? (
              <span className="remix-chat-title remix-chat-title-activity">
                <span className="remix-chat-activity-dot" aria-hidden="true" />
                <span className="remix-chat-activity-label">
                  {headerActivity}
                </span>
              </span>
            ) : (
              <span className="remix-chat-title">
                <FreestyleMark size={15} />
                <span className="remix-chat-wordmark">Remix</span>
              </span>
            )}
            <span className="remix-chat-actions">
              <button
                type="button"
                className="remix-chat-icon"
                onClick={() => props.onOpenWorkspace(thread.id)}
                aria-label="Open Remix workspace"
                title="Open Remix workspace"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 14 14"
                  aria-hidden="true"
                >
                  <path
                    d="M8 1.5h4.5V6M12.5 1.5 7 7M5.5 2.5H3.25A1.75 1.75 0 0 0 1.5 4.25v6.5a1.75 1.75 0 0 0 1.75 1.75h6.5a1.75 1.75 0 0 0 1.75-1.75V8.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.35"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <button
                type="button"
                className="remix-chat-icon"
                onClick={() => {
                  stop();
                  props.onNewThread();
                }}
                aria-label="Start a new thread"
                title="Start a new thread"
              >
                <svg
                  width="13"
                  height="13"
                  viewBox="0 0 14 14"
                  aria-hidden="true"
                >
                  <path
                    d="M7 2.5v9M2.5 7h9"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
              <button
                type="button"
                className="remix-chat-icon"
                onClick={() => {
                  cancelActiveTurn();
                  onClose();
                }}
                aria-label="Close"
                title="Close (Esc)"
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 10 10"
                  aria-hidden="true"
                >
                  <path
                    d="M2 2l6 6M8 2l-6 6"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </span>
          </div>

          <MessageScroller
            className="remix-chat-scroll"
            viewportRef={scrollRef}
            busy={busy}
            label="Remix conversation"
            contentClassName="remix-chat-thread"
          >
            {messages.length === 0 &&
              actions.length === 0 &&
              !busy &&
              !waitingForApproval && (
                <div className="remix-chat-empty">
                  {liveContext.text
                    ? "Say or type what to do with your selection."
                    : "Nothing selected — ask me to write, research, or answer."}
                </div>
              )}
            {actions.map((action) => (
              <div
                key={action.id}
                className="remix-chat-action"
                data-failed={action.status === "failed"}
              >
                {action.status === "running"
                  ? `${action.label}…`
                  : action.status === "done"
                    ? `${action.label} — replaced your text`
                    : `${action.label} failed — ${action.detail ?? ""}`}
              </div>
            ))}
            {messages.map((message) => (
              <MessageRow key={message.id} message={message} busy={busy} />
            ))}
            {approvals.map((approval) => (
              <RemixApprovalCard
                key={approval.call.toolCallId}
                approval={approval}
                resolving={resolvingApprovalId !== null}
                onResolve={resolveApproval}
              />
            ))}
            {busy && !hasAssistantResponse && props.voiceStatus === null ? (
              <RemixThinkingState />
            ) : null}
          </MessageScroller>

          {displayNotice && (
            <div className="remix-chat-notice" role="alert">
              {displayNotice}
            </div>
          )}

          {!busy &&
          props.voiceStatus === null &&
          messages.length === 0 &&
          liveContext.text ? (
            <div className="remix-chat-quick">
              {REMIX_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="remix-chat-chip"
                  onClick={() => void runPreset(preset)}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          ) : null}

          {props.voiceStatus ? (
            <RemixVoiceCaptureSurface
              status={props.voiceStatus}
              transcript={props.voiceTranscript}
            />
          ) : (
            <>
              <AgentMessageQueueControls
                items={queue.items}
                onUpdate={queue.update}
                onRemove={queue.remove}
                onSteer={queue.steer}
                onError={setNotice}
              />
              <div className="remix-chat-composer">
                <textarea
                  ref={inputRef}
                  className="remix-chat-input"
                  rows={1}
                  value={input}
                  aria-label="Message Remix"
                  placeholder={
                    waitingForApproval
                      ? "Resolve the approval above…"
                      : busy
                        ? "Add a follow-up…"
                        : "Message Remix…"
                  }
                  disabled={waitingForApproval || resolvingApprovalId !== null}
                  onChange={(e) => {
                    setInput(e.target.value);
                    const el = e.currentTarget;
                    el.style.height = "auto";
                    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      submit();
                    }
                  }}
                />
                {busy ? (
                  <button
                    type="button"
                    className="remix-chat-send"
                    onClick={() => stop()}
                    aria-label="Stop"
                    title="Stop"
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 12 12"
                      aria-hidden="true"
                    >
                      <rect x="1.5" y="1.5" width="9" height="9" rx="2" />
                    </svg>
                  </button>
                ) : (
                  <button
                    type="button"
                    className="remix-chat-send"
                    disabled={
                      !input.trim() ||
                      waitingForApproval ||
                      resolvingApprovalId !== null
                    }
                    onClick={submit}
                    aria-label="Send"
                    title="Send"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 16 16"
                      aria-hidden="true"
                    >
                      <path
                        d="M8 12.8V3.6M4.1 7.4 8 3.5l3.9 3.9"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </LazyMotion>
    </div>
  );
}

function RemixApprovalCard({
  approval,
  resolving,
  onResolve,
}: {
  approval: PendingApproval;
  resolving: boolean;
  onResolve: (approval: PendingApproval, allowed: boolean) => void;
}): React.JSX.Element {
  const description = describeAgentAction(approval.call);

  return (
    <section className="remix-chat-approval" aria-live="polite">
      <span className="remix-chat-approval-eyebrow">Approval needed</span>
      <div className="remix-chat-approval-title">
        Remix wants to act locally
      </div>
      <pre className="remix-chat-approval-detail">{description}</pre>
      <div className="remix-chat-approval-actions">
        <button
          type="button"
          className="remix-chat-approval-allow"
          disabled={resolving}
          onClick={() => onResolve(approval, true)}
        >
          {resolving ? "Working…" : "Allow"}
        </button>
        <button
          type="button"
          className="remix-chat-approval-deny"
          disabled={resolving}
          onClick={() => onResolve(approval, false)}
        >
          Don&apos;t allow
        </button>
      </div>
    </section>
  );
}

const TOOL_LABELS: Record<string, { doing: string; done: string }> = {
  get_context: {
    doing: "Looking at your screen…",
    done: "Checked your screen",
  },
  read_document: {
    doing: "Reading the document…",
    done: "Read the document",
  },
  select_all: { doing: "Selecting everything…", done: "Selected everything" },
  select_text: {
    doing: "Selecting in your document…",
    done: "Moved your selection",
  },
  collapse_selection: {
    doing: "Placing the cursor…",
    done: "Placed the cursor",
  },
  copy: { doing: "Reading your selection…", done: "Read your selection" },
  set_clipboard: {
    doing: "Preparing text…",
    done: "Put text on your clipboard",
  },
  set_clipboard_image: {
    doing: "Fetching an image…",
    done: "Put an image on your clipboard",
  },
  paste: { doing: "Pasting…", done: "Pasted into your document" },
  undo: { doing: "Undoing…", done: "Undid the last edit" },
  redo: { doing: "Redoing…", done: "Redid the edit" },
  press_key: { doing: "Pressing a key…", done: "Pressed a key" },
  get_clipboard: {
    doing: "Reading your clipboard…",
    done: "Read your clipboard",
  },
  web_search: { doing: "Searching the web…", done: "Searched the web" },
  image_search: { doing: "Searching images…", done: "Searched images" },
};

/**
 * A gentle acknowledgement while a turn is in flight but before the agent has
 * produced text or disclosed a real tool step. Once either arrives, the
 * conversation takes over so we never mask useful progress with decorative
 * loading copy.
 */
function RemixThinkingState(): React.JSX.Element {
  const [messageIndex, setMessageIndex] = useState(0);
  const message = REMIX_THINKING_MESSAGES[messageIndex];

  useEffect(() => {
    const interval = window.setInterval(() => {
      setMessageIndex((index) => (index + 1) % REMIX_THINKING_MESSAGES.length);
    }, 2_600);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="remix-chat-thinking mx-1 flex items-center gap-2 rounded-[9px] border border-border/70 bg-card/45 px-2.5 py-2 text-[12px] text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.035)]"
    >
      <span
        aria-hidden="true"
        className="grid size-5 shrink-0 place-items-center rounded-full bg-primary/10 text-primary"
      >
        <LoaderCircle className="size-3.5 animate-spin" strokeWidth={1.8} />
      </span>
      <ThinkingShimmer
        key={message}
        duration={2.6}
        className="animate-in fade-in-0 slide-in-from-bottom-0.5 font-medium duration-300"
      >
        {message}
      </ThinkingShimmer>
    </div>
  );
}

/**
 * Voice capture temporarily owns the composer while a Remix hotkey is held.
 * It is deliberately shaped like the normal pill/composer, not a second card:
 * the conversation stays readable and the only changing surface is the input
 * that the user is actively speaking into.
 */
function RemixVoiceCaptureSurface({
  status,
  transcript,
}: {
  status: Exclude<RemixChatVoiceStatus, null>;
  transcript: string | null;
}): React.JSX.Element {
  const isListening = status === "listening";
  const text = transcript?.trim();
  const placeholder = isListening ? "Listening…" : "Transcribing…";

  return (
    <div
      className="remix-chat-voice-capture"
      data-state={status}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="remix-chat-voice-wave" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
      </span>
      <span className="remix-chat-voice-transcript">{text || placeholder}</span>
    </div>
  );
}

/** The compact pill cannot render the full activity timeline, but it should
 * still narrate the step currently happening instead of looking frozen. */
function agentProgressLabel(
  messages: UIMessage[],
  busy: boolean,
): string | null {
  if (!busy) return null;
  const preview = latestAssistantPreview(messages);
  if (preview) return preview;
  const latestAssistant = messages.at(-1);
  if (latestAssistant?.role !== "assistant") return "Thinking…";
  for (
    let partIndex = latestAssistant.parts.length - 1;
    partIndex >= 0;
    partIndex--
  ) {
    const part = latestAssistant.parts[partIndex];
    if (!isToolOrDynamicToolUIPart(part)) continue;
    if (part.state === "output-available" || part.state === "output-error") {
      continue;
    }
    const name = getToolOrDynamicToolName(part);
    return TOOL_LABELS[name]?.doing ?? `Running ${name}…`;
  }
  return "Thinking…";
}

function latestAssistantPreview(messages: UIMessage[]): string | null {
  // A final answer from a prior turn must not make a fresh spoken request
  // look complete before the new turn has streamed a response.
  const message = messages.at(-1);
  if (message?.role !== "assistant") return null;
  const text = message.parts
    .filter(isTextUIPart)
    .map((part) => part.text)
    .join("")
    .trim();
  if (!text) return null;
  const line = text
    .split(/\r?\n/)
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .at(-1);
  if (!line) return null;
  return line.length > 110 ? `…${line.slice(-109)}` : line;
}

const MessageRow = memo(function MessageRow({
  message,
  busy,
}: {
  message: UIMessage;
  busy: boolean;
}): React.JSX.Element {
  if (message.role === "user") {
    const text = message.parts
      .filter(isTextUIPart)
      .map((part) => part.text)
      .join("");
    return <div className="remix-chat-user">{text}</div>;
  }

  const blocks: Array<
    | { kind: "tools"; parts: Array<ToolUIPart | DynamicToolUIPart> }
    | { kind: "text"; text: string; index: number }
  > = [];
  message.parts.forEach((part, index) => {
    if (isToolOrDynamicToolUIPart(part)) {
      const last = blocks[blocks.length - 1];
      if (last?.kind === "tools") last.parts.push(part);
      else blocks.push({ kind: "tools", parts: [part] });
    } else if (isTextUIPart(part) && part.text.trim()) {
      blocks.push({ kind: "text", text: part.text, index });
    }
  });

  return (
    <div className="remix-chat-assistant">
      {blocks.map((block) =>
        block.kind === "tools" ? (
          <ToolActivity
            key={block.parts[0].toolCallId}
            parts={block.parts}
            busy={busy}
          />
        ) : (
          <AssistantText key={`text-${block.index}`} text={block.text} />
        ),
      )}
    </div>
  );
});

function AssistantText({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="remix-chat-response">
      <Markdown text={text} />
    </div>
  );
}

function pretty(value: unknown): string {
  if (value === undefined || value === null) return "—";
  try {
    const text =
      typeof value === "string" ? value : JSON.stringify(value, null, 2);
    return text.length > 2400 ? `${text.slice(0, 2400)}…` : text;
  } catch {
    return String(value);
  }
}

function ToolStepLabel({
  part,
  label,
}: {
  part: ToolUIPart | DynamicToolUIPart;
  label: string;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const finished =
    part.state === "output-available" || part.state === "output-error";
  return (
    <span className="remix-chat-step">
      <button
        type="button"
        className="remix-chat-step-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="remix-chat-step-label">{label}</span>
        <svg
          className="remix-chat-step-chevron"
          data-open={open}
          width="8"
          height="8"
          viewBox="0 0 8 8"
          aria-hidden="true"
        >
          <path
            d="M2.5 1.5 5.5 4 2.5 6.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      <AgentDisclosure open={open}>
        {/* Spans: AgentActivity puts labels in a <span>; block tags would be invalid. */}
        <span className="remix-chat-step-body">
          <span className="remix-chat-step-key">Input</span>
          <span className="remix-chat-step-pre">{pretty(part.input)}</span>
          {finished && (
            <>
              <span className="remix-chat-step-key">Output</span>
              <span className="remix-chat-step-pre">
                {pretty(
                  part.state === "output-error" ? part.errorText : part.output,
                )}
              </span>
            </>
          )}
        </span>
      </AgentDisclosure>
    </span>
  );
}

function ToolActivity({
  parts,
  busy,
}: {
  parts: Array<ToolUIPart | DynamicToolUIPart>;
  busy: boolean;
}): React.JSX.Element {
  const items: AgentActivityItem[] = parts.map((part) => {
    const name = getToolOrDynamicToolName(part);
    const labels = TOOL_LABELS[name] ?? {
      doing: `Running ${name}…`,
      done: `Ran ${name}`,
    };
    const finished =
      part.state === "output-available" || part.state === "output-error";
    const output =
      part.state === "output-available" &&
      typeof part.output === "object" &&
      part.output !== null
        ? (part.output as { ok?: boolean })
        : null;
    const failed = part.state === "output-error" || output?.ok === false;
    return {
      id: part.toolCallId,
      type: "step",
      label: (
        <ToolStepLabel
          part={part}
          label={failed ? `${labels.done} — didn't work` : labels.done}
        />
      ),
      status: finished ? "complete" : "active",
      meta: finished ? undefined : "…",
    };
  });

  const inFlight = parts.find(
    (part) =>
      part.state !== "output-available" && part.state !== "output-error",
  );

  // Override step summary ("Thought for Ns") — these are document tools.
  const summary = `Ran ${parts.length} ${parts.length === 1 ? "tool" : "tools"}`;
  const activeLabel = inFlight
    ? (TOOL_LABELS[getToolOrDynamicToolName(inFlight)]?.doing ??
      `Running ${getToolOrDynamicToolName(inFlight)}…`)
    : undefined;

  return (
    <AgentActivity
      className="remix-chat-activity"
      items={items}
      contentType="step"
      maxHeight={280}
      summary={summary}
      activeLabel={activeLabel}
      status={inFlight && busy ? "working" : "complete"}
    />
  );
}

const Markdown = memo(function Markdown({
  text,
}: {
  text: string;
}): React.JSX.Element {
  return (
    <div className="remix-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
});

const REMIX_CHAT_CSS = `
  .remix-chat {
    position: relative;
    width: 100%;
    height: 100%;
    font-size: 12.5px;
    color: ${INK};
  }
  button.remix-chat {
    display: block;
    border: 0;
    padding: 0;
    background: transparent;
    text-align: left;
    cursor: pointer;
  }

  .remix-chat-face-strip {
    opacity: 0;
    pointer-events: none;
    visibility: hidden;
    transition: opacity 110ms ease, visibility 0s 110ms;
  }
  .remix-chat[data-minimized="true"] .remix-chat-face-strip {
    opacity: 1;
    pointer-events: auto;
    visibility: visible;
    transition: opacity 200ms ease 60ms, visibility 0s;
  }
  .remix-chat-face-full {
    display: flex;
    flex-direction: column;
    min-height: 0;
    opacity: 1;
    visibility: visible;
    transition: opacity 220ms ease 60ms, visibility 0s;
  }
  .remix-chat[data-minimized="true"] .remix-chat-face-full {
    opacity: 0;
    pointer-events: none;
    visibility: hidden;
    transition: opacity 110ms ease, visibility 0s 110ms;
  }

  .remix-mini {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  .remix-mini-head {
    display: flex;
    flex: 0 0 ${MINI_STRIP_HEADER_HEIGHT}px;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    width: 100%;
    padding: 0 12px 0 13px;
  }
  .remix-mini[data-full="true"] .remix-mini-head {
    border-bottom: 1px solid rgba(245, 241, 228, 0.10);
  }
  .remix-mini-identity {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    color: ${INK_DIM};
    font-size: 10px;
    font-weight: 650;
    letter-spacing: 0.13em;
    text-transform: uppercase;
  }
  .remix-mini-progress {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    color: ${INK_FAINT};
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.01em;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .remix-mini-actions {
    display: inline-flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 3px;
  }
  .remix-mini-icon {
    width: 24px;
    height: 24px;
    flex-shrink: 0;
    border: 0;
    border-radius: 7px;
    padding: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    color: ${INK_FAINT};
    cursor: pointer;
    transition: background 140ms ease, color 140ms ease, transform 140ms ease;
  }
  .remix-mini-icon:hover,
  .remix-mini-icon:focus-visible {
    background: rgba(138, 182, 42, 0.22);
    color: ${INK};
    outline: none;
  }
  .remix-mini-icon:active { transform: scale(0.92); }
  .remix-mini-icon:focus-visible {
    box-shadow: 0 0 0 2px rgba(138, 182, 42, 0.6);
  }
  .remix-mini-dot {
    flex-shrink: 0;
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: ${OLIVE};
  }
  .remix-mini-dot[data-busy="true"] {
    background: #F5F1E4;
    animation: remix-mini-pulse 1.1s ease-in-out infinite;
  }
  .remix-mini-dot[data-failed="true"] { background: rgba(224, 128, 95, 0.9); }
  @keyframes remix-mini-pulse {
    0%, 100% { opacity: 0.35; transform: scale(0.8); }
    50% { opacity: 1; transform: scale(1); }
  }
  .remix-mini-message {
    flex: 1;
    min-height: 0;
    width: 100%;
    max-height: ${MINI_STRIP_MAX - MINI_STRIP_HEADER_HEIGHT}px;
    overflow-y: auto;
    padding: 10px 14px 14px;
    color: ${INK_DIM};
    font-size: 12.5px;
    line-height: 1.5;
  }
  /* No -webkit-app-region:drag — it would swallow leave events for minimize. */
  .remix-chat-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 14px 16px 11px;
  }
  .remix-chat-title {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    min-width: 0;
  }
  .remix-chat-title svg { flex-shrink: 0; color: ${OLIVE}; }
  .remix-chat-wordmark {
    font-family: "Instrument Serif", Georgia, serif;
    font-size: 20px;
    line-height: 1;
    color: ${INK};
  }
  .remix-chat-title-activity {
    gap: 8px;
    color: ${INK_DIM};
  }
  .remix-chat-activity-dot {
    width: 7px;
    height: 7px;
    flex: 0 0 auto;
    border-radius: 999px;
    background: ${OLIVE};
    box-shadow: 0 0 0 3px rgba(138, 182, 42, 0.12);
    animation: remix-mini-pulse 1.3s ease-in-out infinite;
  }
  .remix-chat-activity-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    font-weight: 500;
    line-height: 1.35;
  }
  .remix-chat-actions { display: flex; align-items: center; gap: 2px; flex-shrink: 0; }
  .remix-chat-icon {
    width: 26px;
    height: 26px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 7px;
    background: none;
    color: ${INK_FAINT};
    cursor: pointer;
    transition: background 140ms ease, color 140ms ease;
  }
  .remix-chat-icon:hover { background: rgba(245, 241, 228, 0.08); color: ${INK}; }

  .remix-chat-scroll { flex: 1; min-height: 0; }
  .remix-chat-thread {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 4px 18px 12px;
  }
  .remix-chat-empty {
    color: ${INK_FAINT};
    line-height: 1.5;
    font-size: 13px;
  }
  .remix-chat ::-webkit-scrollbar { width: 9px; height: 9px; }
  .remix-chat ::-webkit-scrollbar-track { background: transparent; }
  .remix-chat ::-webkit-scrollbar-corner { background: transparent; }
  .remix-chat ::-webkit-scrollbar-thumb {
    background: rgba(245, 241, 228, 0.16);
    border-radius: 99px;
    border: 3px solid transparent;
    background-clip: padding-box;
  }
  .remix-chat ::-webkit-scrollbar-thumb:hover {
    background: rgba(245, 241, 228, 0.28);
    border: 3px solid transparent;
    background-clip: padding-box;
  }
  .remix-chat-user {
    align-self: flex-end;
    max-width: 88%;
    background: rgba(245, 241, 228, 0.13);
    border-radius: 13px 13px 4px 13px;
    padding: 8px 12px;
    line-height: 1.5;
    color: ${INK};
    white-space: pre-wrap;
    word-break: break-word;
  }
  .remix-chat-assistant {
    align-self: stretch;
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }
  .remix-chat-activity { font-size: 11.5px; }
  .remix-chat-response { font-size: 13px; }

  .remix-chat-step { display: block; min-width: 0; }
  .remix-chat-step-head {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    border: none;
    background: none;
    padding: 0;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .remix-chat-step-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .remix-chat-step-chevron {
    flex-shrink: 0;
    opacity: 0.5;
    transition: transform 140ms ease, opacity 140ms ease;
  }
  .remix-chat-step-head:hover .remix-chat-step-chevron { opacity: 1; }
  .remix-chat-step-chevron[data-open="true"] { transform: rotate(90deg); opacity: 1; }
  .remix-chat-step-body { display: block; padding: 5px 0 3px; }
  .remix-chat-step-key {
    display: block;
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: ${INK_FAINT};
    padding: 3px 0 2px;
  }
  .remix-chat-step-pre {
    display: block;
    margin: 0;
    padding: 6px 8px;
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.28);
    border: 1px solid rgba(245, 241, 228, 0.08);
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 10px;
    line-height: 1.45;
    color: ${INK_DIM};
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 140px;
    overflow-y: auto;
  }

  .remix-chat-action {
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 9.5px;
    letter-spacing: 0.11em;
    text-transform: uppercase;
    color: ${INK_FAINT};
  }
  .remix-chat-action[data-failed="true"] { color: rgba(224, 128, 95, 0.9); }
  .remix-chat-notice {
    font-size: 11px;
    color: rgba(224, 128, 95, 0.95);
    padding: 6px 18px 0;
    line-height: 1.35;
  }

  .remix-chat-approval {
    display: flex;
    flex-direction: column;
    gap: 7px;
    padding: 12px;
    border: 1px solid rgba(138, 182, 42, 0.46);
    border-radius: 12px;
    background:
      linear-gradient(135deg, rgba(138, 182, 42, 0.14), rgba(245, 241, 228, 0.045)),
      rgba(22, 21, 17, 0.82);
    box-shadow: inset 0 1px 0 rgba(245, 241, 228, 0.07);
  }
  .remix-chat-approval-eyebrow {
    color: ${OLIVE};
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.13em;
    text-transform: uppercase;
  }
  .remix-chat-approval-title {
    color: ${INK};
    font-size: 12.5px;
    font-weight: 650;
  }
  .remix-chat-approval-detail {
    max-height: 98px;
    overflow: auto;
    margin: 0;
    padding: 7px 8px;
    border: 1px solid rgba(245, 241, 228, 0.09);
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.26);
    color: ${INK_DIM};
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 10px;
    line-height: 1.45;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .remix-chat-approval-actions {
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .remix-chat-approval-actions button {
    min-height: 28px;
    border-radius: 8px;
    padding: 0 10px;
    font: inherit;
    font-size: 11px;
    font-weight: 650;
    cursor: pointer;
    transition: transform 130ms ease, background 130ms ease, border-color 130ms ease;
  }
  .remix-chat-approval-actions button:disabled {
    cursor: wait;
    opacity: 0.58;
  }
  .remix-chat-approval-actions button:not(:disabled):active { transform: scale(0.96); }
  .remix-chat-approval-allow {
    border: 1px solid rgba(138, 182, 42, 0.95);
    background: ${OLIVE};
    color: rgba(18, 20, 12, 0.96);
  }
  .remix-chat-approval-allow:not(:disabled):hover { background: #A4D246; }
  .remix-chat-approval-deny {
    border: 1px solid rgba(245, 241, 228, 0.18);
    background: rgba(245, 241, 228, 0.07);
    color: ${INK_DIM};
  }
  .remix-chat-approval-deny:not(:disabled):hover {
    border-color: rgba(245, 241, 228, 0.34);
    background: rgba(245, 241, 228, 0.13);
    color: ${INK};
  }

  .remix-chat-busy { font-size: 12px; }

  .remix-chat-chip {
    display: inline-flex;
    align-items: center;
    border: 1px solid rgba(245, 241, 228, 0.13);
    background: rgba(245, 241, 228, 0.07);
    color: ${INK};
    font-size: 11px;
    line-height: 1;
    padding: 5px 10px;
    border-radius: 999px;
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
  }
  .remix-chat-chip:hover { background: rgba(245, 241, 228, 0.15); }
  .remix-chat-quick {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    padding: 4px 18px 0;
  }
  .remix-chat-composer {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    margin: 10px 14px 13px;
    padding: 8px 8px 8px 13px;
    border: 1px solid rgba(245, 241, 228, 0.16);
    background: rgba(245, 241, 228, 0.05);
    border-radius: 14px;
    transition: border-color 140ms ease;
  }
  .remix-chat-composer:focus-within { border-color: rgba(245, 241, 228, 0.34); }
  .agent-message-queue {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    margin: 7px 14px -3px;
    padding: 6px 7px 6px 10px;
    border: 1px solid rgba(245, 241, 228, 0.16);
    border-radius: 10px;
    background: rgba(245, 241, 228, 0.045);
    color: ${INK_DIM};
  }
  .agent-message-queue-copy { min-width: 0; flex: 1; display: flex; align-items: baseline; gap: 7px; }
  .agent-message-queue-label { flex: 0 0 auto; color: ${OLIVE}; font-family: "JetBrains Mono", ui-monospace, monospace; font-size: 8px; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase; }
  .agent-message-queue-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10.5px; }
  .agent-message-queue-input { min-width: 0; width: 100%; border: 0; outline: 0; background: transparent; color: ${INK}; font: inherit; font-size: 10.5px; }
  .agent-message-queue-actions { display: inline-flex; align-items: center; gap: 2px; flex: 0 0 auto; }
  .agent-message-queue-actions button { display: inline-flex; align-items: center; justify-content: center; min-height: 22px; border: 0; border-radius: 6px; padding: 0 6px; background: transparent; color: ${INK_FAINT}; font: inherit; font-size: 9px; cursor: pointer; }
  .agent-message-queue-actions button:hover:not(:disabled) { background: rgba(245, 241, 228, 0.10); color: ${INK}; }
  .agent-message-queue-actions button:disabled { cursor: wait; opacity: 0.46; }
  .agent-message-queue-steer { gap: 4px; color: ${OLIVE} !important; }
  .agent-message-queue-icon { width: 22px; padding: 0 !important; }
  .remix-chat-voice-capture {
    display: flex;
    align-items: center;
    gap: 9px;
    min-height: 44px;
    margin: 10px 14px 13px;
    padding: 7px 13px;
    overflow: hidden;
    border: 1px solid rgba(245, 241, 228, 0.16);
    border-radius: 14px;
    background: rgba(245, 241, 228, 0.05);
    transition: border-color 140ms ease, background 140ms ease;
  }
  .remix-chat-voice-capture[data-state="listening"] {
    border-color: rgba(138, 182, 42, 0.48);
    background: rgba(138, 182, 42, 0.055);
  }
  .remix-chat-voice-capture[data-state="transcribing"] {
    border-color: rgba(245, 241, 228, 0.18);
    background: rgba(245, 241, 228, 0.05);
  }
  .remix-chat-voice-wave {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
    width: 23px;
    height: 20px;
    flex: 0 0 auto;
  }
  .remix-chat-voice-wave > span {
    width: 2px;
    height: 6px;
    border-radius: 999px;
    background: ${OLIVE};
    animation: remix-voice-wave 850ms ease-in-out infinite;
  }
  .remix-chat-voice-wave > span:nth-child(2) { animation-delay: 90ms; }
  .remix-chat-voice-wave > span:nth-child(3) { animation-delay: 180ms; }
  .remix-chat-voice-wave > span:nth-child(4) { animation-delay: 270ms; }
  .remix-chat-voice-wave > span:nth-child(5) { animation-delay: 360ms; }
  .remix-chat-voice-capture[data-state="transcribing"] .remix-chat-voice-wave > span {
    animation-name: remix-mini-pulse;
    animation-duration: 1.15s;
  }
  @keyframes remix-voice-wave {
    0%, 100% { height: 6px; opacity: 0.48; }
    50% { height: 17px; opacity: 1; }
  }
  .remix-chat-voice-transcript {
    min-width: 0;
    flex: 1;
    overflow: hidden;
    color: ${INK_DIM};
    font-size: 12px;
    line-height: 1.45;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .remix-chat-input {
    flex: 1;
    resize: none;
    border: none;
    background: transparent;
    color: ${INK};
    font-size: 12.5px;
    line-height: 1.45;
    font-family: inherit;
    outline: none;
    padding: 5px 0;
    min-height: 20px;
    max-height: 120px;
  }
  .remix-chat-input::placeholder { color: ${INK_FAINT}; }
  .remix-chat-send {
    width: 28px;
    height: 28px;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 999px;
    background: rgba(245, 241, 228, 0.92);
    color: rgba(24, 22, 18, 0.95);
    cursor: pointer;
    transition: opacity 140ms ease, transform 140ms ease;
  }
  .remix-chat-send svg rect { fill: currentColor; }
  .remix-chat-send:disabled { opacity: 0.3; cursor: default; }
  .remix-chat-send:not(:disabled):hover { transform: scale(1.06); }
  .remix-chat-send:not(:disabled):active { transform: scale(0.95); }

  .remix-md { line-height: 1.6; word-break: break-word; }
  .remix-md > *:first-child { margin-top: 0; }
  .remix-md > *:last-child { margin-bottom: 0; }
  .remix-md p { margin: 0 0 8px; }
  .remix-md h1, .remix-md h2, .remix-md h3, .remix-md h4 {
    margin: 12px 0 6px;
    font-weight: 600;
    line-height: 1.3;
    color: ${INK};
  }
  .remix-md h1 { font-size: 14.5px; }
  .remix-md h2 { font-size: 13.5px; }
  .remix-md h3, .remix-md h4 { font-size: 12.5px; }
  .remix-md ul, .remix-md ol { margin: 0 0 8px; padding-left: 18px; }
  .remix-md li { margin: 2px 0; }
  .remix-md li > ul, .remix-md li > ol { margin-bottom: 0; }
  .remix-md a { color: ${OLIVE}; text-decoration: underline; text-underline-offset: 2px; }
  .remix-md a:hover { color: #A6D03F; }
  .remix-md strong { font-weight: 600; color: ${INK}; }
  .remix-md em { font-style: italic; }
  .remix-md code {
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-size: 11px;
    background: rgba(245, 241, 228, 0.1);
    border-radius: 4px;
    padding: 1px 4px;
  }
  .remix-md pre {
    margin: 0 0 8px;
    padding: 8px 10px;
    border-radius: 10px;
    background: rgba(0, 0, 0, 0.3);
    border: 1px solid rgba(245, 241, 228, 0.08);
    overflow-x: auto;
  }
  .remix-md pre code { background: none; padding: 0; font-size: 10.5px; line-height: 1.5; }
  .remix-md blockquote {
    margin: 0 0 8px;
    padding-left: 11px;
    border-left: 1px solid rgba(245, 241, 228, 0.22);
    color: ${INK_DIM};
  }
  .remix-md hr {
    border: none;
    border-top: 1px solid rgba(245, 241, 228, 0.14);
    margin: 10px 0;
  }
  .remix-md table { border-collapse: collapse; margin: 0 0 8px; font-size: 11.5px; }
  .remix-md th, .remix-md td {
    border: 1px solid rgba(245, 241, 228, 0.16);
    padding: 4px 8px;
    text-align: left;
  }
  .remix-md th { background: rgba(245, 241, 228, 0.06); font-weight: 600; }
`;
