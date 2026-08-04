import { useChat } from "@ai-sdk/react";
import { REMIX_PRESETS, type RemixPreset } from "@freestyle-voice/validations";
import { capture } from "@renderer/lib/analytics";
import { apiFetch } from "@renderer/lib/api";
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

/**
 * The agent-lane chat card. Lives inside the pill's card surface; the thread
 * itself lives in the local server's SQLite (the cloud stores nothing), so
 * closing the card loses nothing — the next message rejoins the thread.
 *
 * The card has two faces. Minimized, it is a one-line strip that narrates the
 * most recent thing the agent did — voice runs live here, doing their work
 * without opening a window. Hovering the strip grows it into the full
 * conversation; the pointer leaving the conversation shrinks it back.
 */

const INK = "rgba(245, 241, 228, 0.92)";
const INK_DIM = "rgba(245, 241, 228, 0.58)";
const INK_FAINT = "rgba(245, 241, 228, 0.42)";

export const REMIX_CHAT_SURFACE = { width: 408, height: 560 } as const;
export const REMIX_CHAT_STRIP = { width: 320, height: 44 } as const;

export interface RemixChatAnchor {
  v: "top" | "bottom";
  h: "right" | "center";
}

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
  threadId: number;
  resumed: boolean;
  messages: UIMessage[];
}

export interface RemixChatProps {
  /** The capture from the hotkey press that opened this card. */
  context: RemixSelectionPayload;
  /** A spoken or typed instruction to send as soon as the thread is ready. */
  initialInstruction: string | null;
  /** Collapsed to the one-line activity strip. */
  minimized: boolean;
  anchor: RemixChatAnchor;
  onExpand: () => void;
  onMinimize: () => void;
  onClose: () => void;
  /** The strip layer's current height — the settled strip grows around the
   * agent's final message, and the host surface has to grow with it. */
  onMiniHeightChange?: (height: number) => void;
}

export function RemixChat(props: RemixChatProps): React.JSX.Element {
  const [thread, setThread] = useState<ThreadState | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  // Held as state, not read from props, so "New" can clear it: the thread
  // component remounts per thread, and a remount that still saw the opening
  // instruction would send it again — into the thread that was supposed to
  // be empty.
  const [initialInstruction, setInitialInstruction] = useState(
    props.initialInstruction,
  );

  // The chat input needs the keyboard, and the pill window is focusable:false
  // by design — focusability follows the card exactly.
  useEffect(() => {
    window.api?.setRemixChatFocus(!props.minimized);
    return () => window.api?.setRemixChatFocus(false);
  }, [props.minimized]);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/remix/thread")
      .then(async (res) => {
        if (!res.ok) throw new Error(`thread fetch ${res.status}`);
        const data = (await res.json()) as ThreadState & {
          threadId: number | null;
        };
        if (data.threadId !== null) {
          if (!cancelled) setThread(data as ThreadState);
          return;
        }
        const created = await apiFetch("/api/remix/thread/new", {
          method: "POST",
        });
        if (!created.ok) throw new Error(`thread new ${created.status}`);
        const fresh = (await created.json()) as ThreadState;
        if (!cancelled) setThread(fresh);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // A failure strip nobody hovers closes itself like the idle strip does —
  // the corner goes back to the bar instead of holding an error nobody read.
  useEffect(() => {
    if (!loadFailed || !props.minimized) return;
    const timer = setTimeout(props.onClose, MINI_IDLE_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [loadFailed, props.minimized, props.onClose]);

  useEffect(() => {
    if (props.initialInstruction) {
      setInitialInstruction(props.initialInstruction);
    }
  }, [props.initialInstruction]);

  const startNewThread = useCallback(() => {
    // A new thread starts from nothing: no carried-over instruction, no
    // in-flight run (the New button stops the stream before calling this).
    setInitialInstruction(null);
    setThread(null);
    setLoadFailed(false);
    apiFetch("/api/remix/thread/new", { method: "POST" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`thread new ${res.status}`);
        setThread((await res.json()) as ThreadState);
      })
      .catch(() => setLoadFailed(true));
  }, []);

  if (loadFailed) {
    if (props.minimized) {
      return <MiniStrip text="Remix couldn't open" onEnter={props.onExpand} />;
    }
    return (
      <div style={{ padding: 14, fontSize: 12.5, color: INK_DIM }}>
        <style>{REMIX_CHAT_CSS}</style>
        Couldn't open Remix. Is the Freestyle server running?
      </div>
    );
  }
  if (!thread) {
    if (props.minimized) {
      return <MiniStrip text="Opening Remix…" busy onEnter={props.onExpand} />;
    }
    return (
      <div style={{ padding: 14, fontSize: 12.5, color: INK_FAINT }}>
        <style>{REMIX_CHAT_CSS}</style>
        Opening Remix…
      </div>
    );
  }
  return (
    <RemixThread
      key={thread.threadId}
      thread={thread}
      context={props.context}
      initialInstruction={initialInstruction}
      minimized={props.minimized}
      anchor={props.anchor}
      onExpand={props.onExpand}
      onMinimize={props.onMinimize}
      onClose={props.onClose}
      onNewThread={startNewThread}
      onMiniHeightChange={props.onMiniHeightChange}
    />
  );
}

/** The one-line face, shared by the thread and the pre-thread states. */
function MiniStrip(props: {
  text: string;
  busy?: boolean;
  failed?: boolean;
  onEnter?: () => void;
}): React.JSX.Element {
  return (
    // Hover is a shortcut, not the only way in: the strip expands from the
    // hotkey and the bar too, so a pointer-only affordance here excludes
    // nobody.
    // biome-ignore lint/a11y/noStaticElementInteractions: see above
    <div
      className="remix-chat"
      data-testid="remix-chat-mini"
      onMouseEnter={props.onEnter}
    >
      <style>{REMIX_CHAT_CSS}</style>
      <div className="remix-mini">
        <span
          className="remix-mini-dot"
          data-busy={props.busy === true}
          data-failed={props.failed === true}
        />
        <span className="remix-mini-text">{props.text}</span>
      </div>
    </div>
  );
}

interface RemixThreadProps {
  thread: ThreadState;
  context: RemixSelectionPayload;
  initialInstruction: string | null;
  minimized: boolean;
  anchor: RemixChatAnchor;
  onExpand: () => void;
  onMinimize: () => void;
  onClose: () => void;
  onNewThread: () => void;
  onMiniHeightChange?: (height: number) => void;
}

/** A fast-lane preset run, shown inline in the thread like a tool row. */
interface ActionRow {
  id: number;
  label: string;
  status: "running" | "done" | "failed";
  detail?: string;
}

/** How long the pointer can be gone before the conversation folds back up. */
const MINIMIZE_GRACE_MS = 380;

/**
 * How long the idle strip lingers un-hovered before the whole session closes
 * and the corner goes back to the bar. Long enough to read the result line,
 * short enough that the strip never becomes furniture.
 */
const MINI_IDLE_DISMISS_MS = 7000;

/** How long the settled strip (final message included) lingers un-hovered. */
const MINI_SETTLED_DISMISS_MS = 3000;

// The settled strip shows the agent's final message in full. The strip layer
// grows around it, and the window grows around the layer (main clamps the
// window; past the cap the message scrolls inside the strip).
const MINI_STRIP_PAD = 24; // .remix-mini[data-full] vertical padding
const MINI_STRIP_MAX = 316; // main's 340 window cap minus the chrome

function RemixThread(props: RemixThreadProps): React.JSX.Element {
  const { thread, minimized, anchor, onExpand, onMinimize, onClose } = props;
  const [input, setInput] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [actions, setActions] = useState<ActionRow[]>([]);
  const actionSeqRef = useRef(0);

  // The context the next request rides on. Starts as the hotkey capture and
  // follows the prop when a capture lands after the card is already open (bar
  // hover, late selection copy); typed follow-ups re-capture so the agent
  // sees the document as it is now.
  const contextRef = useRef<RemixSelectionPayload>(props.context);
  // Mirrored into state so the empty-state copy and the preset guard track
  // every refresh, not just the capture that opened the card.
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
        api: "/api/remix/agent",
        // apiFetch resolves the server base URL and injects the local bearer
        // token; 401/429 become the same interactive prompts the rest of the
        // app uses instead of raw stream errors.
        fetch: (async (_input: unknown, init?: RequestInit) => {
          const res = await apiFetch("/api/remix/agent", init ?? {});
          if (res.status === 401) {
            void window.api?.cloudPromptSignIn();
            throw new Error("Sign in to Freestyle Cloud to use Remix.");
          }
          if (res.status === 429) {
            void window.api?.cloudPromptUpgrade();
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
    [],
  );

  /**
   * The tool executor is a thin switch: one primitive, one IPC, result
   * returned verbatim. No composites, no guardrails, no notes — the agent's
   * system prompt owns the workflow and the error handling.
   */
  const executeTool = useCallback(
    async (toolCall: {
      toolName: string;
      toolCallId: string;
      input: unknown;
    }): Promise<Record<string, unknown>> => {
      const name = toolCall.toolName;
      const input = (toolCall.input ?? {}) as Record<string, unknown>;
      const str = (key: string): string =>
        typeof input[key] === "string" ? (input[key] as string) : "";
      const num = (key: string): number | undefined =>
        typeof input[key] === "number" ? (input[key] as number) : undefined;
      /**
       * A missing/mistyped argument comes back as an informative failure that
       * echoes what the model actually sent — so it can self-correct on the
       * next step, and so the console shows the malformed call verbatim.
       */
      const badArgs = (expected: string): Record<string, unknown> => ({
        ok: false,
        reason: "bad-args",
        expected,
        received: JSON.stringify(toolCall.input)?.slice(0, 300) ?? "undefined",
      });

      const result = await runTool();
      if (import.meta.env.DEV) {
        console.log(
          `[remix] ${name}(${JSON.stringify(toolCall.input)?.slice(0, 400) ?? ""}) →`,
          JSON.stringify(result).slice(0, 400),
        );
      }
      return result;

      async function runTool(): Promise<Record<string, unknown>> {
        switch (name) {
          case "get_context": {
            const res = await window.api.remixGetContext();
            if (res.ok) {
              contextRef.current = {
                text: res.selection,
                appName: res.appName,
                windowTitle: res.windowTitle,
                url: res.url,
                clipboard: res.clipboardPreview ?? null,
                clipboardLength: res.clipboardLength ?? 0,
                capturedAt: Date.now(),
              };
              setLiveContext(contextRef.current);
            }
            return { ...res };
          }
          case "read_document":
            return { ...(await window.api.remixReadDocument()) };
          case "select_all":
            return { ...(await window.api.remixSelectAll()) };
          case "select_text":
            if (!str("text")) return badArgs("{ text: string }");
            return {
              ...(await window.api.remixSelectText(
                str("text"),
                num("occurrence"),
              )),
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
            return {
              ...(await window.api.remixPressKey(str("key"), num("times"))),
            };
          case "get_clipboard":
            return { ...(await window.api.remixGetClipboard()) };
          default:
            return { ok: false, reason: `unknown tool: ${name}` };
        }
      }
    },
    [],
  );
  const { messages, sendMessage, addToolResult, status, stop, clearError } =
    useChat<UIMessage>({
      id: `remix-thread-${thread.threadId}`,
      messages: thread.messages,
      transport,
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
      onToolCall: async ({ toolCall }) => {
        const output = await executeTool(
          toolCall as unknown as {
            toolName: string;
            toolCallId: string;
            input: unknown;
          },
        );
        void addToolResult({
          tool: getToolOrDynamicToolName(toolCall as never) as never,
          toolCallId: (toolCall as { toolCallId: string }).toolCallId,
          output,
        });
      },
      onError: (err) => {
        setNotice(err.message || "Remix failed.");
      },
      onFinish: ({ messages: finished }) => {
        void apiFetch("/api/remix/thread/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            threadId: thread.threadId,
            messages: finished,
          }),
        }).catch(() => {});
      },
    });

  const busy = status === "submitted" || status === "streaming";

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
  useEffect(
    () => () => {
      void stopRef.current();
    },
    [],
  );

  // The spoken instruction that opened the card, sent exactly once — the ref
  // is the guard, so re-renders (and dependency changes) can't re-send it.
  const sentInitialRef = useRef(false);
  useEffect(() => {
    if (sentInitialRef.current) return;
    const instruction = props.initialInstruction?.trim();
    if (!instruction) return;
    sentInitialRef.current = true;
    lastInstructionRef.current = instruction;
    void sendMessage({ text: instruction });
    capture("remix_message_sent", { source: "dictated" });
  }, [props.initialInstruction, sendMessage]);

  // Analytics: one `remix_tool_used` per tool call, observed from the stream
  // so server tools (web_search, image_search) count the same way as client
  // primitives (copy, paste, …). The seen-set seeds from the restored thread
  // so reloaded history never recounts; tool names only, never content.
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

  const scrollPinnedRef = useRef(true);
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    scrollPinnedRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 48;
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll to the newest content whenever the thread grows, streaming starts, or the strip expands
  useEffect(() => {
    const el = scrollRef.current;
    if (el && scrollPinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [messages, busy, minimized]);

  // ---- Minimize on leave, expand on hover ----
  // Leave detection listens at the document level for the pointer exiting
  // the window (`mouseout` with no relatedTarget) rather than for mouseleave
  // on the card: rows appear and disappear under the cursor while the agent
  // works, and element-level leave events get lost across those reflows. The
  // grace timer separates "left the card" from "grazed its edge", and a
  // half-typed draft pins the card open — folding it up would take the
  // keyboard away mid-thought.
  const minimizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearMinimizeTimer = useCallback(() => {
    if (minimizeTimerRef.current) {
      clearTimeout(minimizeTimerRef.current);
      minimizeTimerRef.current = null;
    }
  }, []);
  useEffect(() => clearMinimizeTimer, [clearMinimizeTimer]);
  const handleMouseEnter = useCallback(() => {
    clearMinimizeTimer();
    if (minimized) onExpand();
  }, [clearMinimizeTimer, minimized, onExpand]);
  useEffect(() => {
    if (minimized) return;
    const handleOver = (): void => {
      clearMinimizeTimer();
      document.removeEventListener("mouseover", handleOver);
    };
    const handleOut = (event: MouseEvent): void => {
      if (event.relatedTarget) return;
      if (inputRef.current?.value.trim()) return;
      clearMinimizeTimer();
      minimizeTimerRef.current = setTimeout(() => {
        minimizeTimerRef.current = null;
        document.removeEventListener("mouseover", handleOver);
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
      stopRef.current();
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [minimized, onClose]);

  // Once the run settles, the strip stops narrating and shows the agent's
  // final message in full. The window has to grow around it: measure the
  // rendered message, grow the strip layer to fit, and ask main for the
  // matching window height (clamped there); past the cap the message
  // scrolls inside the strip.
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
  const showFullFinal =
    minimized && settled && notice === null && finalText !== null;
  const miniStripHeight = showFullFinal
    ? Math.min(
        Math.max(
          miniContentHeight ?? REMIX_CHAT_STRIP.height,
          REMIX_CHAT_STRIP.height,
        ),
        MINI_STRIP_MAX,
      )
    : REMIX_CHAT_STRIP.height;

  // The host surface (the pill card wrapping this component) sizes the strip
  // itself, so it has to follow the growth or it clips the message.
  const onMiniHeightChangeRef = useRef(props.onMiniHeightChange);
  onMiniHeightChangeRef.current = props.onMiniHeightChange;
  useEffect(() => {
    onMiniHeightChangeRef.current?.(miniStripHeight);
  }, [miniStripHeight]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: finalText re-runs the measurement when a new final message lands in the same settled state
  useLayoutEffect(() => {
    if (!minimized) return;
    if (!showFullFinal) {
      // Back to the one-line strip.
      setMiniContentHeight(null);
      return;
    }
    const el = miniMessageRef.current;
    if (!el) return;
    setMiniContentHeight(el.scrollHeight + MINI_STRIP_PAD);
  }, [minimized, showFullFinal, finalText]);

  // The strip doesn't outstay its welcome: once the run has settled, a beat
  // without a hover and it hands the corner back to the bar. Hovering keeps
  // it (and expands into the full thread, where the message stays readable).
  useEffect(() => {
    if (!minimized || !settled) return;
    const timer = setTimeout(onClose, MINI_SETTLED_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [minimized, settled, onClose]);

  /**
   * Re-read the live highlight so EVERY user-initiated request carries the
   * selection as it is right now — typed messages, quick actions, and preset
   * chips all pass through here before acting.
   */
  const refreshContext = useCallback(async () => {
    try {
      const re = await window.api.remixRecapture();
      if (re && !re.stale) {
        contextRef.current = {
          // A null read can mean "nothing highlighted" OR "the app answered
          // too slowly" — keep the last known selection rather than wiping
          // it; the verify-before-replace layer catches genuine staleness
          // before anything is overwritten.
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
      // Stale context beats no message.
    }
  }, []);

  // No structural refresh here: the agent owns freshness via get_context,
  // per its system prompt. The snapshot in the request is labeled as
  // summon-time state.
  const sendText = useCallback(
    (text: string) => {
      setNotice(null);
      clearError();
      lastInstructionRef.current = text;
      void sendMessage({ text });
    },
    [clearError, sendMessage],
  );

  const submit = useCallback(() => {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    const el = inputRef.current;
    if (el) el.style.height = "auto";
    sendText(text);
    capture("remix_message_sent", { source: "typed" });
  }, [busy, input, sendText]);

  /**
   * A preset chip: the fast lane, inside the chat surface. One-shot transform
   * of the selection, delivered through the same anchored paste as the agent's
   * tools, drawn as an inline action row rather than a thread turn.
   */
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
        void window.api?.cloudPromptSignIn();
        throw new Error("Sign in to Freestyle Cloud first.");
      }
      if (res.status === 429) {
        void window.api?.cloudPromptUpgrade();
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
      // The selection in the document is now the edited text.
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
    // biome-ignore lint/a11y/noStaticElementInteractions: hover only cancels the minimize timer; every control inside has its own keyboard path and Esc closes the card
    <div
      className="remix-chat"
      data-minimized={minimized}
      data-testid={minimized ? "remix-chat-mini" : "remix-chat"}
      onMouseEnter={handleMouseEnter}
    >
      <style>{REMIX_CHAT_CSS}</style>

      <div
        className="remix-chat-face remix-chat-face-strip"
        style={anchoredLayerStyle(anchor, {
          width: REMIX_CHAT_STRIP.width,
          height: miniStripHeight,
        })}
        aria-hidden={!minimized}
      >
        <div className="remix-mini" data-full={showFullFinal}>
          <span
            className="remix-mini-dot"
            data-busy={busy || !settled}
            data-failed={notice !== null}
          />
          {showFullFinal ? (
            <div className="remix-mini-message" ref={miniMessageRef}>
              <Markdown text={finalText ?? ""} />
            </div>
          ) : (
            <span className="remix-mini-text">
              {notice ?? latestActivity(messages, busy || !settled)}
            </span>
          )}
        </div>
      </div>

      <div
        className="remix-chat-face remix-chat-face-full"
        style={anchoredLayerStyle(anchor, REMIX_CHAT_SURFACE)}
        aria-hidden={minimized}
      >
        <div className="remix-chat-head">
          <span className="remix-chat-title">
            <FreestyleMark size={14} />
            <span>Remix</span>
            {props.context.appName ? (
              <span className="remix-chat-app"> · {props.context.appName}</span>
            ) : null}
          </span>
          <span className="remix-chat-actions">
            <button
              type="button"
              className="remix-chat-ghost"
              onClick={() => {
                stop();
                props.onNewThread();
              }}
              title="Start a new thread"
            >
              New thread
            </button>
            <button
              type="button"
              className="remix-chat-x"
              onClick={() => {
                stop();
                onClose();
              }}
              aria-label="Close"
              title="Close (Esc)"
            >
              <svg
                width="10"
                height="10"
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

        {thread.resumed && messages.length > 0 && (
          <div className="remix-chat-resumed">Continuing your last thread</div>
        )}

        <div
          className="remix-chat-scroll"
          ref={scrollRef}
          onScroll={handleScroll}
        >
          {messages.length === 0 && actions.length === 0 && !busy && (
            <div className="remix-chat-empty">
              {liveContext.text
                ? "Say or type what to do with your selection, or pick a preset below."
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
            <MessageRow key={message.id} message={message} />
          ))}
          {busy && (
            <div className="remix-chat-busy" role="status" aria-live="polite">
              Working…
            </div>
          )}
        </div>

        {notice && (
          <div className="remix-chat-notice" role="status" aria-live="polite">
            {notice}
          </div>
        )}

        {!busy && messages.length === 0 && liveContext.text ? (
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

        <div className="remix-chat-composer">
          <textarea
            ref={inputRef}
            className="remix-chat-input"
            rows={1}
            value={input}
            aria-label="Message Remix"
            placeholder={busy ? "Working…" : "Message Remix…"}
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
              disabled={!input.trim()}
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
      </div>
    </div>
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
 * The strip's single line: the most recent thing worth narrating, scanning
 * the newest message backwards — a tool call in flight, a tool call landed,
 * or the latest streamed text.
 */
function latestActivity(messages: UIMessage[], busy: boolean): string {
  for (let m = messages.length - 1; m >= 0; m--) {
    const message = messages[m];
    for (let i = message.parts.length - 1; i >= 0; i--) {
      const part = message.parts[i];
      if (isToolOrDynamicToolUIPart(part)) {
        const name = getToolOrDynamicToolName(part);
        const labels = TOOL_LABELS[name] ?? {
          doing: `Running ${name}…`,
          done: `Ran ${name}`,
        };
        const finished =
          part.state === "output-available" || part.state === "output-error";
        return finished && !busy ? labels.done : labels.doing;
      }
      if (isTextUIPart(part) && part.text.trim()) {
        const line = part.text.trim().split("\n")[0] ?? "";
        // The user's own words aren't news to them — while the agent is
        // getting started they read better as what it is chewing on.
        if (message.role === "user") return busy ? "Thinking…" : `“${line}”`;
        return line;
      }
    }
  }
  return busy ? "Thinking…" : "Freestyle Remix";
}

const MessageRow = memo(function MessageRow({
  message,
}: {
  message: UIMessage;
}): React.JSX.Element {
  if (message.role === "user") {
    const text = message.parts
      .filter(isTextUIPart)
      .map((part) => part.text)
      .join("");
    return <div className="remix-chat-user">{text}</div>;
  }
  return (
    <div className="remix-chat-assistant">
      {message.parts.map((part, index) => {
        if (isTextUIPart(part)) {
          return part.text.trim() ? (
            // eslint-disable-next-line react/no-array-index-key
            <Markdown key={index} text={part.text} />
          ) : null;
        }
        if (isToolOrDynamicToolUIPart(part)) {
          return <ToolRow key={part.toolCallId} part={part} />;
        }
        return null;
      })}
    </div>
  );
});

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
          // Chat links open in the real browser (the window's open handler
          // routes target=_blank there) instead of navigating the pill.
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

/** Render a tool payload for the expanded row. */
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

/**
 * A tool call in the thread: one quiet line, expandable to the raw input and
 * output for anyone who wants to see exactly what the agent did.
 */
function ToolRow({
  part,
}: {
  part: ToolUIPart | DynamicToolUIPart;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const name = getToolOrDynamicToolName(part);
  const labels = TOOL_LABELS[name] ?? {
    doing: `Running ${name}…`,
    done: name,
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
  return (
    <div className="remix-chat-tool" data-failed={failed}>
      <button
        type="button"
        className="remix-chat-tool-head"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <svg
          className="remix-chat-tool-chevron"
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
        <span className="remix-chat-tool-label">
          {finished ? labels.done : labels.doing}
          {failed ? " — didn't work" : ""}
        </span>
      </button>
      {open && (
        <div className="remix-chat-tool-body">
          <div className="remix-chat-tool-key">Input</div>
          <pre className="remix-chat-tool-pre">{pretty(part.input)}</pre>
          {finished && (
            <>
              <div className="remix-chat-tool-key">Output</div>
              <pre className="remix-chat-tool-pre">
                {pretty(
                  part.state === "output-error" ? part.errorText : part.output,
                )}
              </pre>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const REMIX_CHAT_CSS = `
  .remix-chat {
    position: relative;
    width: 100%;
    height: 100%;
    font-size: 12.5px;
    color: ${INK};
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
    padding: 12px 14px 13px;
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

  /* ---- The minimized strip ---- */
  .remix-mini {
    display: flex;
    align-items: center;
    gap: 9px;
    height: 100%;
    padding: 0 16px;
  }
  .remix-mini-dot {
    flex-shrink: 0;
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: rgba(245, 241, 228, 0.45);
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
  .remix-mini[data-full="true"] {
    align-items: flex-start;
    height: 100%;
    padding: 12px 16px;
  }
  .remix-mini[data-full="true"] .remix-mini-dot { margin-top: 5px; }
  .remix-mini-message {
    flex: 1;
    min-width: 0;
    max-height: ${MINI_STRIP_MAX - MINI_STRIP_PAD}px;
    overflow-y: auto;
    font-size: 12.5px;
    line-height: 1.5;
    color: ${INK_DIM};
  }
  .remix-mini-text {
    flex: 1;
    min-width: 0;
    font-size: 12px;
    color: ${INK_DIM};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ---- The full conversation ---- */
  /* No drag region here: Electron routes pointer events over a drag region
     to the window manager, so a cursor leaving the card across a draggable
     header would never fire the leave events the minimize choreography
     depends on. */
  .remix-chat-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 2px 2px 10px;
  }
  .remix-chat-title {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    font-weight: 600;
    font-size: 13px;
  }
  .remix-chat-title svg { flex-shrink: 0; color: rgba(245, 241, 228, 0.85); }
  .remix-chat-app {
    color: ${INK_FAINT};
    font-weight: 400;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .remix-chat-actions { display: flex; align-items: center; gap: 6px; }
  .remix-chat-x {
    width: 22px;
    height: 22px;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 7px;
    background: rgba(245, 241, 228, 0.09);
    color: ${INK_DIM};
    cursor: pointer;
  }
  .remix-chat-x:hover { background: rgba(245, 241, 228, 0.16); color: ${INK}; }
  .remix-chat-ghost {
    border: none;
    background: rgba(245, 241, 228, 0.09);
    color: ${INK_DIM};
    font-size: 10.5px;
    padding: 3px 8px;
    border-radius: 7px;
    cursor: pointer;
  }
  .remix-chat-ghost:hover { background: rgba(245, 241, 228, 0.16); color: ${INK}; }
  .remix-chat-resumed {
    font-size: 10.5px;
    color: ${INK_FAINT};
    padding: 0 2px 6px;
  }
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
    padding: 8px 2px 0;
  }
  .remix-chat-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 2px;
  }
  /* Scrollbars on the ink surface: thin, cream-tinted, no track — the
     default light scrollbar reads as a bright stripe against the dark card. */
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
  .remix-chat-empty { color: ${INK_FAINT}; padding-top: 8px; line-height: 1.45; }
  .remix-chat-user {
    align-self: flex-end;
    max-width: 85%;
    background: rgba(245, 241, 228, 0.13);
    border-radius: 14px 14px 4px 14px;
    padding: 7px 11px;
    line-height: 1.45;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .remix-chat-assistant {
    align-self: flex-start;
    max-width: 94%;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  /* ---- Tool rows ---- */
  .remix-chat-tool {
    border-left: 2px solid rgba(245, 241, 228, 0.18);
    padding-left: 7px;
  }
  .remix-chat-tool[data-failed="true"] { border-left-color: rgba(224, 128, 95, 0.55); }
  .remix-chat-tool-head {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border: none;
    background: none;
    padding: 0;
    font-size: 11px;
    color: ${INK_FAINT};
    cursor: pointer;
    text-align: left;
  }
  .remix-chat-tool-head:hover { color: ${INK_DIM}; }
  .remix-chat-tool[data-failed="true"] .remix-chat-tool-head {
    color: rgba(224, 128, 95, 0.85);
  }
  .remix-chat-tool-chevron {
    flex-shrink: 0;
    transition: transform 140ms ease;
  }
  .remix-chat-tool-chevron[data-open="true"] { transform: rotate(90deg); }
  .remix-chat-tool-body { padding: 5px 0 2px; }
  .remix-chat-tool-key {
    font-size: 9.5px;
    font-weight: 600;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: ${INK_FAINT};
    padding: 3px 0 2px;
  }
  .remix-chat-tool-pre {
    margin: 0;
    padding: 6px 8px;
    border-radius: 8px;
    background: rgba(0, 0, 0, 0.28);
    border: 1px solid rgba(245, 241, 228, 0.08);
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 10px;
    line-height: 1.45;
    color: ${INK_DIM};
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 140px;
    overflow-y: auto;
  }

  .remix-chat-action {
    font-size: 11px;
    color: ${INK_FAINT};
    border-left: 2px solid rgba(245, 241, 228, 0.18);
    padding-left: 7px;
  }
  .remix-chat-action[data-failed="true"] { color: rgba(224, 128, 95, 0.85); }
  .remix-chat-busy { color: ${INK_FAINT}; font-size: 11px; }
  .remix-chat-notice {
    font-size: 11px;
    color: rgba(224, 128, 95, 0.9);
    padding: 6px 2px 0;
    line-height: 1.35;
  }

  /* ---- Markdown ---- */
  .remix-md { line-height: 1.5; word-break: break-word; }
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
  .remix-md a { color: #9CC2E8; text-decoration: underline; text-underline-offset: 2px; }
  .remix-md a:hover { color: #BAD6F2; }
  .remix-md strong { font-weight: 600; color: ${INK}; }
  .remix-md em { font-style: italic; }
  .remix-md code {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
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
  .remix-md pre code {
    background: none;
    padding: 0;
    font-size: 10.5px;
    line-height: 1.5;
  }
  .remix-md blockquote {
    margin: 0 0 8px;
    padding-left: 9px;
    border-left: 2px solid rgba(245, 241, 228, 0.22);
    color: ${INK_DIM};
  }
  .remix-md hr {
    border: none;
    border-top: 1px solid rgba(245, 241, 228, 0.14);
    margin: 10px 0;
  }
  .remix-md table {
    border-collapse: collapse;
    margin: 0 0 8px;
    font-size: 11.5px;
  }
  .remix-md th, .remix-md td {
    border: 1px solid rgba(245, 241, 228, 0.16);
    padding: 4px 8px;
    text-align: left;
  }
  .remix-md th { background: rgba(245, 241, 228, 0.06); font-weight: 600; }

  /* ---- Composer ---- */
  .remix-chat-composer {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    margin-top: 10px;
    padding: 8px 8px 8px 13px;
    border: 1px solid rgba(245, 241, 228, 0.16);
    background: rgba(245, 241, 228, 0.05);
    border-radius: 14px;
    transition: border-color 140ms ease;
  }
  .remix-chat-composer:focus-within { border-color: rgba(245, 241, 228, 0.34); }
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
`;
