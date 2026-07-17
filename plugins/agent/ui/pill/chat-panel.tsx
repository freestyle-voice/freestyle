import type { PillEvent, PillState } from "freestyle-voice";
import { useCallback, useEffect, useRef, useState } from "react";
import { getJson } from "../shared/api";
import type { ConversationEntry } from "../shared/types";

interface StatusView {
  label: string;
  color: string;
  pulse: boolean;
}

function statusFor(state: PillState, thinking: boolean): StatusView {
  if (state === "recording") {
    return {
      label: "Listening",
      color: "var(--primary, #8AB62A)",
      pulse: true,
    };
  }
  if (thinking || state === "transcribing") {
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
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const data = await getJson<{ conversation: ConversationEntry[] }>(
      "/conversation",
    );
    if (data?.conversation) {
      setMessages(data.conversation);
      setThinking(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, thinking]);

  useEffect(() => {
    const pill = window.freestyle?.pill;
    if (!pill) return;

    const unsub = pill.subscribe((event: PillEvent) => {
      if (event.type === "stateChanged") {
        setPillState(event.state);
        if (event.state === "idle") void refresh();
      }
      if (event.type === "transcriptReady") {
        setMessages((prev) => [...prev, { role: "user", content: event.text }]);
        setThinking(true);
        void refresh();
      }
    });

    void pill.getState().then(setPillState);
    return unsub;
  }, [refresh]);

  const status = statusFor(pillState, thinking);
  const empty = messages.length === 0 && !thinking;

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
        <div className="messages" ref={scrollRef}>
          {messages.map((msg, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: append-only chat log
              key={i}
              className={`turn ${msg.role}`}
            >
              <span className={`turn-role ${msg.role}`}>
                {msg.role === "user" ? "You" : "Agent"}
              </span>
              <span className="turn-text">{msg.content}</span>
            </div>
          ))}
          {thinking && (
            <div className="turn assistant">
              <span className="turn-role assistant">Agent</span>
              <span className="typing">
                <span />
                <span />
                <span />
              </span>
            </div>
          )}
        </div>
      )}

      <div className="footer">
        <span className="kbd">hold your key</span>
        <span>to reply</span>
      </div>
    </div>
  );
}
