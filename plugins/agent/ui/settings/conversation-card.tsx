import { useCallback, useEffect, useState } from "react";
import { del, getJson } from "../shared/api";
import type { ConversationEntry } from "../shared/types";

export function ConversationCard(): React.JSX.Element {
  const [messages, setMessages] = useState<ConversationEntry[]>([]);

  const refresh = useCallback(async () => {
    const data = await getJson<{ conversation: ConversationEntry[] }>(
      "/conversation",
    );
    setMessages(data?.conversation ?? []);
  }, []);

  useEffect(() => {
    void refresh();
    // Poll lightly so a conversation held elsewhere (the pill) stays in sync
    // while this page is open.
    const id = setInterval(refresh, 4000);
    return () => clearInterval(id);
  }, [refresh]);

  const clear = useCallback(async () => {
    await del("/conversation");
    setMessages([]);
  }, []);

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <div className="eyebrow">History</div>
          <h2>Conversation</h2>
          <p className="card-desc">
            The running thread you've had with the agent.
          </p>
        </div>
        {messages.length > 0 && (
          <button type="button" className="btn btn-ghost" onClick={clear}>
            Clear
          </button>
        )}
      </div>

      {messages.length === 0 ? (
        <p className="item-empty">
          No conversation yet. Say the agent's name to start one.
        </p>
      ) : (
        <div className="conversation">
          {messages.map((m, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: append-only log
              key={i}
              className="turn"
            >
              <span className={`turn-role ${m.role}`}>
                {m.role === "user" ? "You" : "Agent"}
              </span>
              <span className="turn-text">{m.content}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
