import { useCallback, useState } from "react";
import type { SavedConversation } from "../shared/types";

interface Props {
  conversation: SavedConversation;
  onClose: () => void;
  onDelete: () => void;
}

function CopyIcon(): React.JSX.Element {
  return (
    <svg
      width="14"
      height="14"
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
      width="14"
      height="14"
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
      className="copy-msg-btn"
      onClick={handleCopy}
      aria-label={copied ? "Copied" : "Copy message"}
      title={copied ? "Copied" : "Copy"}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}

export function ConversationViewer({
  conversation,
  onClose,
  onDelete,
}: Props): React.JSX.Element {
  return (
    <div className="detail-pane">
      <div className="detail-header">
        <button
          type="button"
          className="back-btn"
          onClick={onClose}
          aria-label="Back"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10 3L5 8l5 5" />
          </svg>
        </button>
        <span className="detail-title">{conversation.title}</span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={onDelete}
        >
          Delete
        </button>
      </div>

      <div className="detail-messages">
        {conversation.messages.map((msg, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: immutable saved log
            key={i}
            className="detail-turn"
          >
            <div className="detail-turn-header">
              <span className={`turn-role ${msg.role}`}>
                {msg.role === "user" ? "You" : "Agent"}
              </span>
              <CopyButton text={msg.content} />
            </div>
            <div className="detail-turn-text">{msg.content}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
