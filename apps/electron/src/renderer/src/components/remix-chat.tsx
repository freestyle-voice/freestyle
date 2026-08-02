import { useChat } from "@ai-sdk/react";
import { REMIX_PRESETS, type RemixPreset } from "@freestyle-voice/validations";
import { apiFetch } from "@renderer/lib/api";
import {
  DefaultChatTransport,
  getToolOrDynamicToolName,
  isTextUIPart,
  isToolOrDynamicToolUIPart,
  lastAssistantMessageIsCompleteWithToolCalls,
  type UIMessage,
} from "ai";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RemixSelectionPayload } from "../../../shared/remix";

/**
 * The agent-lane chat card. Lives inside the pill's card surface; the thread
 * itself lives in the local server's SQLite (the cloud stores nothing), so
 * closing the card loses nothing — the next message rejoins the thread.
 */

const INK = "rgba(245, 241, 228, 0.92)";
const INK_DIM = "rgba(245, 241, 228, 0.58)";
const INK_FAINT = "rgba(245, 241, 228, 0.42)";

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
  onClose: () => void;
}

export function RemixChat(props: RemixChatProps): React.JSX.Element {
  const [thread, setThread] = useState<ThreadState | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  // The chat input needs the keyboard, and the pill window is focusable:false
  // by design — focusability follows the card exactly.
  useEffect(() => {
    window.api?.setRemixChatFocus(true);
    return () => window.api?.setRemixChatFocus(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/remix/thread")
      .then(async (res) => {
        if (!res.ok) throw new Error(`thread fetch ${res.status}`);
        const data = (await res.json()) as ThreadState;
        if (!cancelled) setThread(data);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const startNewThread = useCallback(() => {
    setThread(null);
    apiFetch("/api/remix/thread/new", { method: "POST" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`thread new ${res.status}`);
        setThread((await res.json()) as ThreadState);
      })
      .catch(() => setLoadFailed(true));
  }, []);

  if (loadFailed) {
    return (
      <div style={{ padding: 14, fontSize: 12, color: INK_DIM }}>
        Couldn't open Remix. Is the Freestyle server running?
      </div>
    );
  }
  if (!thread) {
    return (
      <div style={{ padding: 14, fontSize: 12, color: INK_FAINT }}>
        Opening Remix…
      </div>
    );
  }
  return (
    <RemixThread
      key={thread.threadId}
      thread={thread}
      context={props.context}
      initialInstruction={props.initialInstruction}
      onClose={props.onClose}
      onNewThread={startNewThread}
    />
  );
}

interface RemixThreadProps {
  thread: ThreadState;
  context: RemixSelectionPayload;
  initialInstruction: string | null;
  onClose: () => void;
  onNewThread: () => void;
}

/** A fast-lane preset run, shown inline in the thread like a tool row. */
interface ActionRow {
  id: number;
  label: string;
  status: "running" | "done" | "failed";
  detail?: string;
}

/** Canned follow-ups — most iteration is one of a handful of moves. */
const QUICK_ACTIONS = [
  { label: "Shorter", text: "Make it shorter." },
  { label: "More formal", text: "Make it more formal." },
  { label: "Try again", text: "Try that again — take a different approach." },
] as const;

function RemixThread(props: RemixThreadProps): React.JSX.Element {
  const { thread } = props;
  const [input, setInput] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [actions, setActions] = useState<ActionRow[]>([]);
  const actionSeqRef = useRef(0);
  // The context chip can hide the selection from the agent without losing it.
  const [includeSelection, setIncludeSelection] = useState(true);
  const includeSelectionRef = useRef(true);
  includeSelectionRef.current = includeSelection;
  // Same for the clipboard preview.
  const [includeClipboard, setIncludeClipboard] = useState(true);
  const includeClipboardRef = useRef(true);
  includeClipboardRef.current = includeClipboard;

  // The context the next request rides on. Starts as the hotkey capture and
  // follows the prop when a capture lands after the card is already open (bar
  // hover, late selection copy); typed follow-ups re-capture so the agent
  // sees the document as it is now.
  const contextRef = useRef<RemixSelectionPayload>(props.context);
  // Mirrored into state so the context chips track every refresh, not just
  // the capture that opened the card.
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
              selection: includeSelectionRef.current
                ? contextRef.current.text
                : null,
              appName: contextRef.current.appName,
              windowTitle: contextRef.current.windowTitle,
              clipboard: includeClipboardRef.current
                ? (contextRef.current.clipboard ?? null)
                : null,
              clipboardLength: includeClipboardRef.current
                ? (contextRef.current.clipboardLength ?? 0)
                : 0,
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
      console.log(
        `[remix] ${name}(${JSON.stringify(toolCall.input)?.slice(0, 400) ?? ""}) →`,
        JSON.stringify(result).slice(0, 400),
      );
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

  // The spoken instruction that opened the card, sent exactly once — the ref
  // is the guard, so re-renders (and dependency changes) can't re-send it.
  const sentInitialRef = useRef(false);
  useEffect(() => {
    if (sentInitialRef.current) return;
    sentInitialRef.current = true;
    const instruction = props.initialInstruction?.trim();
    if (instruction) {
      lastInstructionRef.current = instruction;
      void sendMessage({ text: instruction });
    }
  }, [props.initialInstruction, sendMessage]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll to the newest content whenever the thread grows or streaming starts
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy]);

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
    void sendText(text);
  }, [busy, input, sendText]);

  /**
   * A preset chip: the fast lane, inside the chat surface. One-shot transform
   * of the selection, delivered through the same anchored paste as the agent's
   * tools, drawn as an inline action row rather than a thread turn.
   */
  const runPreset = useCallback(
    async (preset: RemixPreset) => {
      if (busy) return;
      await refreshContext();
      const selection = contextRef.current.text;
      if (!selection) {
        setNotice("Nothing is highlighted — select some text first.");
        return;
      }
      if (actions.some((a) => a.status === "running")) return;
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
    },
    [actions, busy, refreshContext],
  );

  return (
    <div className="remix-chat" data-testid="remix-chat">
      <style>{REMIX_CHAT_CSS}</style>

      <div className="remix-chat-head">
        <span className="remix-chat-title">
          Remix
          {props.context.appName ? (
            <span className="remix-chat-app"> · {props.context.appName}</span>
          ) : null}
        </span>
        <span className="remix-chat-actions">
          <button
            type="button"
            className="remix-chat-ghost"
            onClick={props.onNewThread}
            title="Start a new thread"
          >
            New
          </button>
          <button
            type="button"
            className="remix-chat-ghost"
            onClick={props.onClose}
            title="Close (Esc)"
          >
            Close
          </button>
        </span>
      </div>

      {/* What the agent can see this turn — the transparency surface. The
          selection chip is a toggle: click it and the selection stays local. */}
      <div className="remix-chat-context">
        {liveContext.appName && (
          <span
            className="remix-chat-chip"
            title={liveContext.windowTitle ?? undefined}
          >
            {liveContext.appName}
          </span>
        )}
        {liveContext.text ? (
          <button
            type="button"
            className="remix-chat-chip remix-chat-chip-toggle"
            data-off={!includeSelection}
            onClick={() => setIncludeSelection((v) => !v)}
            title={
              includeSelection
                ? "The agent can see your selection. Click to hide it."
                : "Hidden from the agent. Click to share it."
            }
          >
            Selection · {liveContext.text.length.toLocaleString()} chars
            {includeSelection ? "" : " · hidden"}
          </button>
        ) : (
          <span className="remix-chat-chip" data-dim="true">
            No selection
          </span>
        )}
        {liveContext.clipboard ? (
          <button
            type="button"
            className="remix-chat-chip remix-chat-chip-toggle"
            data-off={!includeClipboard}
            onClick={() => setIncludeClipboard((v) => !v)}
            title={
              includeClipboard
                ? "The agent can see a preview of your clipboard. Click to hide it."
                : "Hidden from the agent. Click to share it."
            }
          >
            Clipboard · {(liveContext.clipboardLength ?? 0).toLocaleString()}{" "}
            chars
            {includeClipboard ? "" : " · hidden"}
          </button>
        ) : null}
      </div>

      {thread.resumed && messages.length > 0 && (
        <div className="remix-chat-resumed">Continuing your last thread</div>
      )}

      <div className="remix-chat-scroll" ref={scrollRef}>
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
            className="remix-chat-tool"
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
        {busy && <div className="remix-chat-busy">Working…</div>}
      </div>

      {notice && <div className="remix-chat-notice">{notice}</div>}

      {/* One chip row: presets while there is a selection to transform and
          no conversation yet; canned follow-ups once there is one. */}
      {!busy && messages.length === 0 && liveContext.text ? (
        <div className="remix-chat-quick">
          {REMIX_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className="remix-chat-chip remix-chat-chip-action"
              onClick={() => void runPreset(preset)}
            >
              {preset.label}
            </button>
          ))}
        </div>
      ) : !busy && messages.length > 0 ? (
        <div className="remix-chat-quick">
          {QUICK_ACTIONS.map((action) => (
            <button
              key={action.label}
              type="button"
              className="remix-chat-chip remix-chat-chip-action"
              onClick={() => void sendText(action.text)}
            >
              {action.label}
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
          placeholder={busy ? "Working…" : "Ask Remix…"}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              props.onClose();
            }
          }}
        />
        {busy ? (
          <button
            type="button"
            className="remix-chat-send"
            onClick={() => stop()}
          >
            Stop
          </button>
        ) : (
          <button
            type="button"
            className="remix-chat-send"
            disabled={!input.trim()}
            onClick={() => void submit()}
          >
            Send
          </button>
        )}
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

function MessageRow({ message }: { message: UIMessage }): React.JSX.Element {
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
            <div key={index} className="remix-chat-text">
              {part.text}
            </div>
          ) : null;
        }
        if (isToolOrDynamicToolUIPart(part)) {
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
            // eslint-disable-next-line react/no-array-index-key
            <div key={index} className="remix-chat-tool" data-failed={failed}>
              {finished ? labels.done : labels.doing}
              {failed ? " — didn't work" : ""}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}

const REMIX_CHAT_CSS = `
  .remix-chat {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    font-size: 12px;
    color: ${INK};
  }
  .remix-chat-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 2px 2px 8px;
    -webkit-app-region: drag;
  }
  .remix-chat-title { font-weight: 600; font-size: 12.5px; }
  .remix-chat-app { color: ${INK_FAINT}; font-weight: 400; }
  .remix-chat-actions { display: flex; gap: 6px; -webkit-app-region: no-drag; }
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
  .remix-chat-context {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    padding: 0 2px 7px;
  }
  .remix-chat-chip {
    display: inline-flex;
    align-items: center;
    border: 1px solid rgba(245, 241, 228, 0.13);
    background: rgba(245, 241, 228, 0.05);
    color: ${INK_DIM};
    font-size: 10.5px;
    line-height: 1;
    padding: 4px 8px;
    border-radius: 999px;
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .remix-chat-chip[data-dim="true"] { color: ${INK_FAINT}; }
  .remix-chat-chip-toggle { cursor: pointer; }
  .remix-chat-chip-toggle[data-off="true"] {
    color: ${INK_FAINT};
    border-style: dashed;
  }
  .remix-chat-chip-action {
    cursor: pointer;
    color: ${INK};
    background: rgba(245, 241, 228, 0.09);
  }
  .remix-chat-chip-action:hover { background: rgba(245, 241, 228, 0.16); }
  .remix-chat-quick {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    padding: 7px 2px 0;
  }
  .remix-chat-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 2px;
  }
  .remix-chat-empty { color: ${INK_FAINT}; padding-top: 8px; line-height: 1.4; }
  .remix-chat-user {
    align-self: flex-end;
    max-width: 85%;
    background: rgba(245, 241, 228, 0.13);
    border-radius: 12px 12px 3px 12px;
    padding: 6px 10px;
    line-height: 1.4;
    white-space: pre-wrap;
    word-break: break-word;
  }
  .remix-chat-assistant {
    align-self: flex-start;
    max-width: 92%;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .remix-chat-text { line-height: 1.45; white-space: pre-wrap; word-break: break-word; }
  .remix-chat-tool {
    font-size: 11px;
    color: ${INK_FAINT};
    border-left: 2px solid rgba(245, 241, 228, 0.18);
    padding-left: 7px;
  }
  .remix-chat-tool[data-failed="true"] { color: rgba(224, 128, 95, 0.85); }
  .remix-chat-busy { color: ${INK_FAINT}; font-size: 11px; }
  .remix-chat-notice {
    font-size: 11px;
    color: rgba(224, 128, 95, 0.9);
    padding: 6px 2px 0;
    line-height: 1.35;
  }
  .remix-chat-composer {
    display: flex;
    align-items: flex-end;
    gap: 7px;
    padding-top: 9px;
  }
  .remix-chat-input {
    flex: 1;
    resize: none;
    border: 1px solid rgba(245, 241, 228, 0.14);
    background: rgba(245, 241, 228, 0.06);
    color: ${INK};
    border-radius: 10px;
    padding: 7px 10px;
    font-size: 12px;
    line-height: 1.35;
    font-family: inherit;
    outline: none;
    max-height: 72px;
  }
  .remix-chat-input:focus { border-color: rgba(245, 241, 228, 0.3); }
  .remix-chat-input::placeholder { color: ${INK_FAINT}; }
  .remix-chat-send {
    border: none;
    border-radius: 9px;
    background: rgba(245, 241, 228, 0.92);
    color: rgba(24, 22, 18, 0.95);
    font-size: 11.5px;
    font-weight: 600;
    padding: 7px 11px;
    cursor: pointer;
  }
  .remix-chat-send:disabled { opacity: 0.35; cursor: default; }
`;
