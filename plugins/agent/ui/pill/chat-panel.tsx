import type { PillEvent, PillState } from "freestyle-voice";
import { useCallback, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { getJson } from "../shared/api";
import type { ConversationEntry } from "../shared/types";

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

function CopyButton({ text }: { text: string }): React.JSX.Element {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    window.freestyle?.invoke("copy", { text });
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [text]);

  return (
    <button
      type="button"
      className="copy-btn"
      onClick={handleCopy}
      aria-label={copied ? "Copied" : "Copy message"}
      title={copied ? "Copied" : "Copy"}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}

export function ChatPanel(): React.JSX.Element {
  const [messages, setMessages] = useState<ConversationEntry[]>([]);
  const [pillState, setPillState] = useState<PillState>("idle");
  const [streamingText, setStreamingText] = useState<string | null>(null);
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

  useEffect(() => {
    const pill = window.freestyle?.pill;
    if (!pill) return;

    const unsub = pill.subscribe((event: PillEvent) => {
      switch (event.type) {
        case "stateChanged":
          setPillState(event.state);
          if (event.state === "idle") void refresh();
          break;
        case "transcriptReady":
          setMessages((prev) => [
            ...prev,
            { role: "user", content: event.text },
          ]);
          void refresh();
          break;
        case "streamStart":
          setStreamingText("");
          break;
        case "streamDelta":
          setStreamingText((prev) => (prev ?? "") + event.text);
          break;
        case "streamEnd":
          setStreamingText(null);
          void refresh();
          break;
      }
    });

    void pill.getState().then(setPillState);
    return unsub;
  }, [refresh]);

  const handleClose = useCallback(() => {
    window.freestyle?.pill?.collapse();
  }, []);

  const streaming = streamingText !== null;
  const status = statusFor(pillState, streaming);
  const empty = messages.length === 0 && !streaming;

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
              <div className="turn-header">
                <span className={`turn-role ${msg.role}`}>
                  {msg.role === "user" ? "You" : "Agent"}
                </span>
                <CopyButton text={msg.content} />
              </div>
              <div className="turn-text markdown">
                <Markdown remarkPlugins={[remarkGfm]}>{msg.content}</Markdown>
              </div>
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
