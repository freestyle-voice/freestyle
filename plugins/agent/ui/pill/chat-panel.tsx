import type { PillEvent, PillState } from "freestyle-voice";
import { useCallback, useEffect, useRef, useState } from "react";
import { del, getJson } from "../shared/api";
import type { ConversationEntry } from "../shared/types";
import {
  brandRowStyle,
  bubbleStyle,
  composerStyle,
  emptyHintStyle,
  emptyMarkStyle,
  emptyTitleStyle,
  emptyWrapStyle,
  headerStyle,
  iconBtnStyle,
  KEYFRAMES,
  kbdStyle,
  markStyle,
  messagesStyle,
  panelStyle,
  roleLabelStyle,
  statusDotStyle,
  statusPillStyle,
  statusRowStyle,
  titleStyle,
  turnStyle,
  typingDotStyle,
  typingStyle,
} from "./styles";

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

  const clear = useCallback(async () => {
    await del("/conversation");
    setMessages([]);
  }, []);

  const status = statusFor(pillState, thinking);
  const empty = messages.length === 0 && !thinking;

  return (
    <div style={panelStyle}>
      <style>{KEYFRAMES}</style>

      <header style={headerStyle}>
        <div style={brandRowStyle}>
          <span style={markStyle} aria-hidden>
            ✦
          </span>
          <span style={titleStyle}>Voice Agent</span>
        </div>
        <div style={statusRowStyle}>
          <span style={statusPillStyle(status.color)}>
            <span style={statusDotStyle(status.color, status.pulse)} />
            {status.label}
          </span>
          <button
            type="button"
            onClick={clear}
            style={iconBtnStyle}
            title="Clear conversation"
            aria-label="Clear conversation"
          >
            ⌫
          </button>
          <button
            type="button"
            onClick={() => window.freestyle?.pill?.collapse()}
            style={iconBtnStyle}
            title="Close"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      </header>

      {empty ? (
        <div style={emptyWrapStyle}>
          <span style={emptyMarkStyle} aria-hidden>
            ✦
          </span>
          <div style={emptyTitleStyle}>Ask me anything</div>
          <div style={emptyHintStyle}>
            Say <b>“Hey Freestyle …”</b> to start. Press your dictation key
            again to continue the conversation.
          </div>
        </div>
      ) : (
        <div ref={scrollRef} style={messagesStyle}>
          {messages.map((msg, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: append-only chat log
              key={i}
              style={{
                ...turnStyle(msg.role),
                animation: "agent-rise 200ms ease",
              }}
            >
              <span style={roleLabelStyle}>
                {msg.role === "user" ? "You" : "Agent"}
              </span>
              <div style={bubbleStyle(msg.role)}>{msg.content}</div>
            </div>
          ))}
          {thinking && (
            <div style={turnStyle("assistant")}>
              <span style={roleLabelStyle}>Agent</span>
              <div style={typingStyle}>
                <span style={typingDotStyle(0)} />
                <span style={typingDotStyle(1)} />
                <span style={typingDotStyle(2)} />
              </div>
            </div>
          )}
        </div>
      )}

      <footer style={composerStyle}>
        <span style={kbdStyle}>hold your key</span>
        <span>to reply by voice</span>
      </footer>
    </div>
  );
}
