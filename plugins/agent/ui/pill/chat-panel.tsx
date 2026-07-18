import type { PillEvent, PillState } from "freestyle-voice";
import { useCallback, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { agentApiBase, getJson, postJson } from "../shared/api";
import type { ConversationEntry } from "../shared/types";

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

function statusFor(state: PillState, streaming: boolean): StatusView {
  if (state === "recording") {
    return {
      label: "Listening",
      color: "var(--primary, #8AB62A)",
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

/* ---- Main component ---- */

export function ChatPanel(): React.JSX.Element {
  const [messages, setMessages] = useState<ConversationEntry[]>([]);
  const [pillState, setPillState] = useState<PillState>("idle");
  const [streamingText, setStreamingText] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const scrollToEnd = useCallback(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, []);

  const refresh = useCallback(async () => {
    const data = await getJson<{ conversation: ConversationEntry[] }>(
      "/conversation",
    );
    if (data?.conversation) setMessages(data.conversation);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
        const event = JSON.parse(e.data) as { type: string; text?: string };
        switch (event.type) {
          case "streamStart":
            void refresh();
            setStreamingText("");
            break;
          case "streamDelta":
            setStreamingText((prev) => (prev ?? "") + (event.text ?? ""));
            break;
          case "streamEnd":
            setStreamingText(null);
            void refresh();
            break;
        }
      } catch {
        // Malformed event — ignore.
      }
    };

    return () => es.close();
  }, [refresh]);

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
          setMessages((prev) => [
            ...prev,
            { role: "user", content: event.text },
          ]);
          void refresh();
          break;
        // Stream events from the pill bridge (WS path).  These arrive in
        // addition to the SSE events — dedup by ignoring them here since
        // SSE is the canonical source now.
        case "streamStart":
        case "streamDelta":
        case "streamEnd":
          break;
      }
    });

    void pill.getState().then(setPillState);
    return unsub;
  }, [refresh]);

  const handleClose = useCallback(() => {
    window.freestyle?.pill?.collapse();
  }, []);

  const handleRegenerate = useCallback(async () => {
    setRegenerating(true);
    const result = await postJson<{ reply: string }>("/regenerate");
    setRegenerating(false);
    if (result) void refresh();
  }, [refresh]);

  const streaming = streamingText !== null;
  const status = statusFor(pillState, streaming);
  const empty = messages.length === 0 && !streaming;

  let lastAssistantIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") {
      lastAssistantIdx = i;
      break;
    }
  }

  return (
    <div className="panel">
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
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: append-only chat log
              key={i}
              className={`turn ${msg.role}`}
            >
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
                  onRegenerate={handleRegenerate}
                  regenerating={regenerating}
                />
              )}
            </div>
          ))}
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

      <div className="footer">
        <span className="kbd">hold your key</span>
        <span>to reply</span>
      </div>
    </div>
  );
}
