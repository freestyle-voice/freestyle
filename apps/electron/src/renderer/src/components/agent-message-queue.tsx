import type { QueuedAgentMessage } from "@renderer/lib/agent-message-queue";
import { Pencil, SendHorizontal, Trash2, X } from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";

type Props = {
  items: QueuedAgentMessage[];
  onUpdate: (id: string, text: string) => Promise<unknown>;
  onRemove: (id: string) => Promise<unknown>;
  onSteer: (id: string) => Promise<unknown>;
  onError?: (message: string) => void;
};

/** A compact, explicit next-message control above either Remix composer. */
export function AgentMessageQueueControls({
  items,
  onUpdate,
  onRemove,
  onSteer,
  onError,
}: Props): React.JSX.Element | null {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const item = items[0];
  const isEditing = item !== undefined && editing === item.id;

  useEffect(() => {
    if (isEditing) inputRef.current?.focus();
  }, [isEditing]);

  if (!item) return null;

  const run = async (key: string, action: () => Promise<unknown>) => {
    setPending(key);
    try {
      await action();
      if (key === `edit:${item.id}` || key === `remove:${item.id}`) {
        setEditing(null);
        setDraft("");
      }
    } catch {
      onError?.("Couldn’t update the queued message. Try again.");
    } finally {
      setPending(null);
    }
  };

  return (
    <section className="agent-message-queue" aria-label="Queued Remix message">
      <div className="agent-message-queue-copy">
        <span className="agent-message-queue-label">
          {items.length > 1 ? `${items.length} queued` : "Queued next"}
        </span>
        {isEditing ? (
          <input
            ref={inputRef}
            className="agent-message-queue-input"
            value={draft}
            aria-label="Edit queued message"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                setEditing(null);
                setDraft("");
              }
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                const text = draft.trim();
                if (text)
                  void run(`edit:${item.id}`, () => onUpdate(item.id, text));
              }
            }}
          />
        ) : (
          <span className="agent-message-queue-text" title={item.text}>
            {item.text}
          </span>
        )}
      </div>
      <div className="agent-message-queue-actions">
        {isEditing ? (
          <>
            <button
              type="button"
              onClick={() => {
                const text = draft.trim();
                if (text)
                  void run(`edit:${item.id}`, () => onUpdate(item.id, text));
              }}
              disabled={!draft.trim() || pending !== null}
            >
              Save
            </button>
            <button
              type="button"
              className="agent-message-queue-icon"
              onClick={() => {
                setEditing(null);
                setDraft("");
              }}
              aria-label="Cancel edit"
              title="Cancel"
            >
              <X size={13} />
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              className="agent-message-queue-steer"
              onClick={() =>
                void run(`steer:${item.id}`, () => onSteer(item.id))
              }
              disabled={pending !== null}
              title="Interrupt the current response and send this next"
            >
              <SendHorizontal size={12} />
              Steer
            </button>
            <button
              type="button"
              className="agent-message-queue-icon"
              onClick={() => {
                setEditing(item.id);
                setDraft(item.text);
              }}
              disabled={pending !== null}
              aria-label="Edit queued message"
              title="Edit"
            >
              <Pencil size={12} />
            </button>
            <button
              type="button"
              className="agent-message-queue-icon"
              onClick={() =>
                void run(`remove:${item.id}`, () => onRemove(item.id))
              }
              disabled={pending !== null}
              aria-label="Remove queued message"
              title="Remove"
            >
              <Trash2 size={12} />
            </button>
          </>
        )}
      </div>
    </section>
  );
}
