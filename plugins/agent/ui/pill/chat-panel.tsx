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

export function ChatPanel(): React.JSX.Element {
  const [messages, setMessages] = useState<ConversationEntry[]>([]);
  const [pillState, setPillState] = useState<PillState>("idle");
  // The live streaming text being built token-by-token.
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

  // Scroll when messages change or streaming text updates.
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
          // Buffered (non-streaming) turn — show user msg + fetch the reply.
          setMessages((prev) => [
            ...prev,
            { role: "user", content: event.text },
          ]);
          void refresh();
          break;
        case "streamStart":
          // A streaming agent turn began — start accumulating deltas.
          setStreamingText("");
          break;
        case "streamDelta":
          setStreamingText((prev) => (prev ?? "") + event.text);
          break;
        case "streamEnd": {
          // Turn complete — fold the streamed text into the message list and
          // refresh from the server (the plugin stored the full reply).
          setStreamingText(null);
          void refresh();
          break;
        }
      }
    });

    void pill.getState().then(setPillState);
    return unsub;
  }, [refresh]);

  const streaming = streamingText !== null;
  const status = statusFor(pillState, streaming);
  const empty = messages.length === 0 && !streaming;

  return (
    <div className="panel">
      <div className="status">
        <span
          className={`status-dot${status.pulse ? " pulse" : ""}`}
          style={{ background: status.color }}
        />
        {status.label}
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
