import type { PillEvent } from "freestyle-voice";
import { useCallback, useEffect, useRef, useState } from "react";

interface Message {
  role: "user" | "assistant";
  content: string;
}

const CONV_URL = "/api/plugins/freestyle-voice-plugin-agent/agent/conversation";

export function AgentPanel(): React.JSX.Element {
  const [messages, setMessages] = useState<Message[]>([]);
  const [pillState, setPillState] = useState("idle");
  const scrollRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const fetchConversation = useCallback(async () => {
    try {
      const res = await window.freestyle?.api(CONV_URL);
      if (res?.ok) {
        const data = (res as Response & { json: <T>() => T }).json<{
          conversation: Message[];
        }>();
        if (data.conversation?.length) {
          setMessages(data.conversation);
        }
      }
    } catch {}
  }, []);

  useEffect(() => {
    void fetchConversation();
  }, [fetchConversation]);

  useEffect(() => {
    const pill = window.freestyle?.pill;
    if (!pill) return;

    const unsub = pill.subscribe((event: PillEvent) => {
      if (event.type === "stateChanged") {
        setPillState(event.state);
      }
      if (event.type === "transcriptReady") {
        void fetchConversation();
      }
    });

    pill.getState().then(setPillState);
    return unsub;
  }, [fetchConversation]);

  const clearConversation = useCallback(async () => {
    try {
      await window.freestyle?.api(CONV_URL, { method: "DELETE" });
      setMessages([]);
    } catch {}
  }, []);

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>Voice Agent</span>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <span style={statusStyle}>
            {pillState === "recording" ? "Listening..." : pillState}
          </span>
          <button
            type="button"
            onClick={clearConversation}
            style={clearBtnStyle}
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => window.freestyle?.pill?.collapse()}
            style={clearBtnStyle}
          >
            Close
          </button>
        </div>
      </div>

      <div ref={scrollRef} style={messagesStyle}>
        {messages.length === 0 && (
          <div style={emptyStyle}>
            Say "agent …" to start, or dictate from a terminal.
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            style={{
              ...messageBubbleStyle,
              alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
              background:
                msg.role === "user"
                  ? "var(--primary, #3B82F6)"
                  : "var(--muted, #27272a)",
              color:
                msg.role === "user"
                  ? "var(--primary-foreground, #fff)"
                  : "var(--foreground, #fafafa)",
            }}
          >
            {msg.content}
          </div>
        ))}
      </div>
    </div>
  );
}

const panelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  height: "100%",
  fontFamily: "'DM Sans', -apple-system, sans-serif",
  background: "var(--background, #09090b)",
  color: "var(--foreground, #fafafa)",
  borderRadius: 12,
  overflow: "hidden",
  border: "1px solid var(--border, #27272a)",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "10px 14px",
  borderBottom: "1px solid var(--border, #27272a)",
  flexShrink: 0,
};

const statusStyle: React.CSSProperties = {
  fontSize: 11,
  opacity: 0.5,
  textTransform: "capitalize",
};

const clearBtnStyle: React.CSSProperties = {
  fontSize: 11,
  padding: "3px 8px",
  borderRadius: 6,
  border: "1px solid var(--border, #27272a)",
  background: "transparent",
  color: "var(--muted-foreground, #a1a1aa)",
  cursor: "pointer",
};

const messagesStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "10px 14px",
  display: "flex",
  flexDirection: "column",
  gap: 8,
};

const emptyStyle: React.CSSProperties = {
  textAlign: "center",
  opacity: 0.4,
  fontSize: 12,
  marginTop: 60,
  padding: "0 20px",
  lineHeight: 1.5,
};

const messageBubbleStyle: React.CSSProperties = {
  padding: "8px 12px",
  borderRadius: 10,
  fontSize: 13,
  lineHeight: 1.4,
  maxWidth: "85%",
  wordBreak: "break-word",
  whiteSpace: "pre-wrap",
};
