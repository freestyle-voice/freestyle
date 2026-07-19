import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { PillEvent, PillState } from "freestyle-voice";
import { useCallback, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { agentApiBase, getJson, postJson } from "../shared/api";
import type {
  ConversationEntry,
  GuidanceEvent,
  ToolCallEvent,
  ToolCallStartEvent,
} from "../shared/types";

/* ---- Icons ---- */

function CloseIcon(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 12 12"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <path d="M3 3l6 6M9 3l-6 6" />
    </svg>
  );
}

function CopyIcon(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="4.5" y="4.5" width="7" height="7" rx="1.5" />
      <path d="M9.5 4.5V3a1.5 1.5 0 0 0-1.5-1.5H3A1.5 1.5 0 0 0 1.5 3v5A1.5 1.5 0 0 0 3 9.5h1.5" />
    </svg>
  );
}

function CheckIcon(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 7.5l3 3 5-6" />
    </svg>
  );
}

function RegenerateIcon(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1.5 7a5.5 5.5 0 0 1 9.9-3.3M12.5 7a5.5 5.5 0 0 1-9.9 3.3" />
      <path d="M11.5 1.5v2.5H9M2.5 12.5V10H5" />
    </svg>
  );
}

/* ---- Status ---- */

interface StatusView {
  label: string;
  color: string;
  pulse: boolean;
}

function statusFor(
  state: PillState,
  streaming: boolean,
  activeTool?: string,
): StatusView {
  if (state === "recording") {
    return {
      label: "Listening",
      color: "var(--primary, #8AB62A)",
      pulse: true,
    };
  }
  if (activeTool) {
    return {
      label: activeTool,
      color: "var(--accent-foreground, #E8EFC9)",
      pulse: true,
    };
  }
  if (streaming || state === "transcribing") {
    return {
      label: "Thinking",
      color: "var(--accent-foreground, #E8EFC9)",
      pulse: true,
    };
  }
  return {
    label: "Ready",
    color: "var(--muted-foreground, #9E977F)",
    pulse: false,
  };
}

/* ---- Action buttons ---- */

function MessageActions({
  text,
  isLast,
  onRegenerate,
  regenerating,
}: {
  text: string;
  isLast: boolean;
  onRegenerate: () => void;
  regenerating: boolean;
}): React.JSX.Element {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    window.freestyle?.invoke("copy", { text });
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [text]);

  return (
    <div className="msg-actions">
      <button
        type="button"
        className="action-btn"
        onClick={handleCopy}
        aria-label={copied ? "Copied" : "Copy"}
        title={copied ? "Copied" : "Copy"}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
      {isLast && (
        <button
          type="button"
          className="action-btn"
          onClick={onRegenerate}
          disabled={regenerating}
          aria-label="Regenerate"
          title="Regenerate"
        >
          <RegenerateIcon />
        </button>
      )}
    </div>
  );
}

/* ---- Tool icons ---- */

function TerminalIcon(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="1.5" y="2" width="11" height="10" rx="1.5" />
      <path d="M4 5.5l2.5 2L4 9.5" />
      <path d="M8 9.5h2.5" />
    </svg>
  );
}

function FileIcon(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8 1.5H4A1.5 1.5 0 0 0 2.5 3v8A1.5 1.5 0 0 0 4 12.5h6A1.5 1.5 0 0 0 11.5 11V5L8 1.5z" />
      <path d="M8 1.5V5h3.5" />
    </svg>
  );
}

function CameraIcon(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M1.5 4.5A1.5 1.5 0 0 1 3 3h1.5l1-1.5h3l1 1.5H11A1.5 1.5 0 0 1 12.5 4.5v5A1.5 1.5 0 0 1 11 11H3a1.5 1.5 0 0 1-1.5-1.5z" />
      <circle cx="7" cy="7" r="2" />
    </svg>
  );
}

function MouseIcon(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4.5 2h5A2.5 2.5 0 0 1 12 4.5v5A2.5 2.5 0 0 1 9.5 12h-5A2.5 2.5 0 0 1 2 9.5v-5A2.5 2.5 0 0 1 4.5 2z" />
      <path d="M7 2v5" />
    </svg>
  );
}

function KeyboardIcon(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="1" y="3" width="12" height="8" rx="1.5" />
      <path d="M4 6h1M6.5 6h1M9 6h1M3.5 8.5h7" />
    </svg>
  );
}

function GlobeIcon(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="7" cy="7" r="5.5" />
      <path d="M1.5 7h11M7 1.5c1.5 1.5 2.3 3.4 2.3 5.5S8.5 11 7 12.5c-1.5-1.5-2.3-3.4-2.3-5.5S5.5 3 7 1.5z" />
    </svg>
  );
}

function ClipboardIcon(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 1.5H5a.5.5 0 0 0-.5.5v1a.5.5 0 0 0 .5.5h4a.5.5 0 0 0 .5-.5V2a.5.5 0 0 0-.5-.5z" />
      <path d="M9.5 2.5H11a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h1.5" />
    </svg>
  );
}

function WrenchIcon(): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M8.5 1.5a4 4 0 0 0-3.7 5.5L1.5 10.3 3.7 12.5 7 9.2A4 4 0 1 0 8.5 1.5z" />
    </svg>
  );
}

const TOOL_ICON_MAP: Record<string, () => React.JSX.Element> = {
  run_command: TerminalIcon,
  read_file: FileIcon,
  write_file: FileIcon,
  list_directory: FileIcon,
  search_files: FileIcon,
  take_screenshot: CameraIcon,
  left_click: MouseIcon,
  right_click: MouseIcon,
  double_click: MouseIcon,
  move_cursor: MouseIcon,
  type_text: KeyboardIcon,
  press_key: KeyboardIcon,
  open_url: GlobeIcon,
  get_clipboard: ClipboardIcon,
  set_clipboard: ClipboardIcon,
  paste_text: ClipboardIcon,
  get_frontmost_app: GlobeIcon,
  run_shortcut: WrenchIcon,
};

/* ---- Tool call tracking ---- */

/** A tool call in either running or completed state. */
interface TrackedToolCall {
  callId: string;
  tool: string;
  input: Record<string, unknown>;
  output?: string;
  isError?: boolean;
  running: boolean;
}

/* ---- Tool Call Card ---- */

function ToolCallCard({ tc }: { tc: TrackedToolCall }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const IconComp = TOOL_ICON_MAP[tc.tool] ?? WrenchIcon;

  const inputSummary = Object.entries(tc.input)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => {
      const val = typeof v === "string" ? v : JSON.stringify(v);
      return `${k}: ${val.length > 50 ? `${val.slice(0, 47)}...` : val}`;
    })
    .join(", ");

  return (
    <div
      className={`tool-card${tc.isError ? " tool-error" : ""}${tc.running ? " tool-running" : ""}`}
    >
      <button
        type="button"
        className="tool-card-head"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="tool-card-icon">
          <IconComp />
        </span>
        <span className="tool-card-name">{tc.tool}</span>
        {tc.running ? (
          <span className="tool-card-spinner" />
        ) : (
          <span className="tool-card-chevron">
            {expanded ? "\u25B4" : "\u25BE"}
          </span>
        )}
      </button>
      {!expanded && !tc.running && inputSummary && (
        <div className="tool-card-summary">{inputSummary}</div>
      )}
      {tc.running && (
        <div className="tool-card-summary tool-card-running-hint">
          {inputSummary || "Running..."}
        </div>
      )}
      {expanded && !tc.running && (
        <div className="tool-card-detail">
          <div className="tool-card-section">
            <span className="tool-card-label">Input</span>
            <pre className="tool-card-pre">
              {JSON.stringify(tc.input, null, 2)}
            </pre>
          </div>
          {tc.output !== undefined && (
            <div className="tool-card-section">
              <span className="tool-card-label">Output</span>
              <pre className="tool-card-pre">{tc.output}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ---- Ghost Cursor Overlay ---- */

const ACCENT = "#7C3AED";

function GhostCursorOverlay({
  event,
}: {
  event: GuidanceEvent | null;
}): React.JSX.Element | null {
  const [seq, setSeq] = useState(0);

  useEffect(() => {
    if (event && event.kind !== "clear") {
      setSeq((s) => s + 1);
    }
  }, [event]);

  if (!event || event.kind === "clear") return null;

  const hasPoint = typeof event.x === "number" && typeof event.y === "number";
  const isClick =
    event.kind === "click" ||
    event.kind === "right_click" ||
    event.kind === "double_click";

  const caption = event.caption?.trim() || defaultGuidanceLabel(event);
  const literal =
    (event.kind === "type" || event.kind === "key") && event.text
      ? event.text
      : null;

  return (
    <div className="guidance-overlay">
      {hasPoint && isClick && (
        <div
          key={`ring-${seq}`}
          className="guidance-ring-container"
          style={{ left: event.x, top: event.y }}
        >
          <span className="guidance-ring" />
          {event.kind === "double_click" && (
            <span className="guidance-ring guidance-ring-delayed" />
          )}
        </div>
      )}
      {hasPoint && (
        <div
          className="guidance-cursor"
          style={{ left: event.x, top: event.y }}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 26 26"
            fill="none"
            aria-hidden="true"
          >
            <title>Guidance cursor</title>
            <path
              d="M5 3.2 L5 20.5 L9.4 16.2 L12.2 22.4 L15 21.1 L12.2 15 L18.3 15 Z"
              fill="white"
              stroke="#1f2937"
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}
      <div
        className="guidance-caption-wrap"
        style={
          hasPoint
            ? { left: (event.x ?? 0) + 18, top: (event.y ?? 0) + 16 }
            : { left: "50%", top: 8, transform: "translateX(-50%)" }
        }
      >
        <div key={`cap-${seq}`} className="guidance-caption-animate">
          <div className="guidance-pill">
            <span className="guidance-dot" />
            <span className="guidance-text">{caption}</span>
          </div>
          {literal && (
            <div className="guidance-literal">
              <span className="guidance-literal-kind">
                {event.kind === "key" ? "key" : "text"}
              </span>
              <span className="guidance-literal-value">{literal}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function defaultGuidanceLabel(e: GuidanceEvent): string {
  switch (e.kind) {
    case "move":
      return "Move here";
    case "click":
      return "Click here";
    case "right_click":
      return "Right-click here";
    case "double_click":
      return "Double-click here";
    case "type":
      return e.text ? `Type "${e.text}"` : "Type here";
    case "key":
      return e.text ? `Press ${e.text}` : "Press a key";
    default:
      return "";
  }
}

/* ---- Query keys ---- */

const conversationKey = ["agent-conversation"] as const;

/* ---- Main component ---- */

export function ChatPanel(): React.JSX.Element {
  const queryClient = useQueryClient();
  const [pillState, setPillState] = useState<PillState>("idle");
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [direction, setDirection] = useState<"up" | "down">("down");
  const [toolCalls, setToolCalls] = useState<TrackedToolCall[]>([]);
  const [guidance, setGuidance] = useState<GuidanceEvent | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // ---- Conversation query ----

  const { data: messages = [] } = useQuery({
    queryKey: conversationKey,
    queryFn: async () => {
      const data = await getJson<{ conversation: ConversationEntry[] }>(
        "/conversation",
      );
      return data?.conversation ?? [];
    },
  });

  // ---- Regenerate mutation ----

  const regenerate = useMutation({
    mutationFn: () => postJson<{ reply: string }>("/regenerate"),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: conversationKey });
    },
  });

  const scrollToEnd = useCallback(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: messages and streamingText are intentional trigger deps for auto-scroll
  useEffect(() => {
    scrollToEnd();
  }, [messages, streamingText, scrollToEnd]);

  // SSE connection — receives live agent events directly from the server.
  // This works on ALL paths (batch and streaming) because the agent plugin
  // broadcasts to connected SSE clients regardless of pipeline path.
  useEffect(() => {
    const url = `${agentApiBase}/stream`;
    const es = new EventSource(url);

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as Record<string, unknown>;
        switch (event.type) {
          case "streamStart":
            void queryClient.invalidateQueries({
              queryKey: conversationKey,
            });
            setStreamingText("");
            setToolCalls([]);
            setGuidance(null);
            break;
          case "streamDelta":
            setStreamingText(
              (prev) => (prev ?? "") + ((event.text as string) ?? ""),
            );
            break;
          case "streamEnd":
            setStreamingText(null);
            setGuidance(null);
            void queryClient.invalidateQueries({
              queryKey: conversationKey,
            });
            break;
          case "toolCallStart":
            setToolCalls((prev) => [
              ...prev,
              {
                callId: event.callId as string,
                tool: event.tool as string,
                input: (event.input ?? {}) as Record<string, unknown>,
                running: true,
              },
            ]);
            break;
          case "toolCall":
            setToolCalls((prev) =>
              prev.map((tc) =>
                tc.callId === (event.callId as string)
                  ? {
                      ...tc,
                      output: event.output as string,
                      isError: event.isError as boolean | undefined,
                      running: false,
                    }
                  : tc,
              ),
            );
            break;
          case "guidance":
            setGuidance(event as unknown as GuidanceEvent);
            break;
        }
      } catch {
        // Malformed event — ignore.
      }
    };

    return () => es.close();
  }, [queryClient]);

  // Also listen to the pill bridge for state changes and transcripts.
  useEffect(() => {
    const pill = window.freestyle?.pill;
    if (!pill) return;

    const unsub = pill.subscribe((event: PillEvent) => {
      switch (event.type) {
        case "stateChanged":
          setPillState(event.state);
          break;
        case "transcriptReady":
          queryClient.setQueryData<ConversationEntry[]>(
            conversationKey,
            (prev) => [...(prev ?? []), { role: "user", content: event.text }],
          );
          break;
        // Stream events from the pill bridge (WS path).  These arrive in
        // addition to the SSE events — dedup by ignoring them here since
        // SSE is the canonical source now.
        case "streamStart":
        case "streamDelta":
        case "streamEnd":
          break;
        default: {
          const raw = event as unknown as Record<string, unknown>;
          if (
            raw.type === "directionChanged" &&
            typeof raw.direction === "string"
          ) {
            setDirection(raw.direction as "up" | "down");
          }
          break;
        }
      }
    });

    void pill.getState().then(setPillState);
    return unsub;
  }, [queryClient]);

  const handleClose = useCallback(() => {
    window.freestyle?.pill?.collapse();
  }, []);

  const streaming = streamingText !== null;
  const runningTool = toolCalls.find((tc) => tc.running);
  const status = statusFor(pillState, streaming, runningTool?.tool);
  const empty = messages.length === 0 && !streaming;

  let lastAssistantIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") {
      lastAssistantIdx = i;
      break;
    }
  }

  return (
    <div
      className={`panel ${direction === "up" ? "expand-up" : "expand-down"}`}
    >
      <GhostCursorOverlay event={guidance} />
      <div className="header">
        <div className="status">
          <span
            className={`status-dot${status.pulse ? " pulse" : ""}`}
            style={{ background: status.color }}
          />
          {status.label}
        </div>
        <button
          type="button"
          className="close-btn"
          onClick={handleClose}
          aria-label="Close panel"
        >
          <CloseIcon />
        </button>
      </div>

      {empty ? (
        <div className="empty">
          <div className="empty-title">Ask me anything</div>
          <div className="empty-hint">
            Say the agent's name to start. Press your dictation key again to
            keep the conversation going.
          </div>
        </div>
      ) : (
        <div className="messages">
          {messages.map((msg, i) => (
            <div key={i} className={`turn ${msg.role}`}>
              <span className={`turn-role ${msg.role}`}>
                {msg.role === "user" ? "You" : "Agent"}
              </span>
              <div className="turn-text markdown">
                <Markdown remarkPlugins={[remarkGfm]}>{msg.content}</Markdown>
              </div>
              {msg.role === "assistant" && (
                <MessageActions
                  text={msg.content}
                  isLast={i === lastAssistantIdx && !streaming}
                  onRegenerate={() => regenerate.mutate()}
                  regenerating={regenerate.isPending}
                />
              )}
            </div>
          ))}
          {toolCalls.length > 0 && (
            <div className="tool-calls">
              {toolCalls.map((tc, i) => (
                <ToolCallCard key={i} tc={tc} />
              ))}
            </div>
          )}
          {streaming && (
            <div className="turn assistant">
              <span className="turn-role assistant">Agent</span>
              <div className="turn-text markdown">
                {streamingText ? (
                  <Markdown remarkPlugins={[remarkGfm]}>
                    {streamingText}
                  </Markdown>
                ) : (
                  <span className="typing">
                    <span />
                    <span />
                    <span />
                  </span>
                )}
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>
      )}
    </div>
  );
}
