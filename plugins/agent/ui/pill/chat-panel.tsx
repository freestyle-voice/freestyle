import type { PillEvent, PillState } from "freestyle-voice";
import { useCallback, useEffect, useRef, useState } from "react";
import { del, getJson } from "../shared/api";
import type { ConversationEntry } from "../shared/types";
import {
  bubbleStyle,
  clearBtnStyle,
  closeBtnStyle,
  emptyStyle,
  headerStyle,
  hintStyle,
  messagesStyle,
  panelStyle,
  statusDotStyle,
  statusRowStyle,
  titleStyle,
} from "./styles";

export function ChatPanel(): React.JSX.Element {
  const [messages, setMessages] = useState<ConversationEntry[]>([]);
  const [pillState, setPillState] = useState<PillState>("idle");
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    const data = await getJson<{ conversation: ConversationEntry[] }>(
      "/conversation",
    );
    if (data?.conversation) setMessages(data.conversation);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Auto-scroll to the newest message.
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
        // The agent turn runs while the server is "transcribing"; once it
        // settles the reply is stored, so refetch when we leave that state.
        if (event.state === "idle") {
          setThinking(false);
          void refresh();
        }
      }
      if (event.type === "transcriptReady") {
        // Optimistically show the user's message and a thinking indicator; the
        // server has the assistant reply stored by the time state returns.
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

  const listening = pillState === "recording";

  return (
    <div style={panelStyle}>
      <div style={headerStyle}>
        <span style={titleStyle}>Voice Agent</span>
        <div style={statusRowStyle}>
          <span
            style={statusDotStyle(
              listening ? "#8AB62A" : thinking ? "#60A5FA" : "#71717a",
            )}
          />
          <span style={{ fontSize: 11, opacity: 0.6 }}>
            {listening ? "Listening" : thinking ? "Thinking" : "Ready"}
          </span>
          <button type="button" onClick={clear} style={clearBtnStyle}>
            Clear
          </button>
          <button
            type="button"
            onClick={() => window.freestyle?.pill?.collapse()}
            style={closeBtnStyle}
            aria-label="Close"
          >
            ✕
          </button>
        </div>
      </div>

      <div ref={scrollRef} style={messagesStyle}>
        {messages.length === 0 && !thinking && (
          <div style={emptyStyle}>
            Say your wake word ("Hey Freestyle …") to start. Press the dictation
            hotkey again to keep the conversation going.
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: append-only log
            key={i}
            style={bubbleStyle(msg.role)}
          >
            {msg.content}
          </div>
        ))}
        {thinking && <div style={bubbleStyle("assistant")}>…</div>}
      </div>

      <div style={hintStyle}>Press the dictation hotkey to reply</div>
    </div>
  );
}
