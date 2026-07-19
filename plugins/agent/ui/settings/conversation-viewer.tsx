import { useCallback, useState } from "react";
import {
  displayToolName,
  type SavedConversation,
  type StoredToolCall,
} from "../shared/types";

interface Props {
  conversation: SavedConversation;
  onClose: () => void;
  onDelete: () => void;
}

/** Compact, read-only tool call display for archived conversations. */
function ToolCallList({
  toolCalls,
}: {
  toolCalls: StoredToolCall[];
}): React.JSX.Element {
  return (
    <div className="detail-tools">
      {toolCalls.map((tc, i) => (
        <ArchivedToolCall key={tc.callId || i} tc={tc} />
      ))}
    </div>
  );
}

function ArchivedToolCall({ tc }: { tc: StoredToolCall }): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className={`detail-tool${tc.isError ? " tool-error" : ""}`}>
      <button
        type="button"
        className="detail-tool-head"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="detail-tool-name">{displayToolName(tc.tool)}</span>
        <span className="detail-tool-chevron">{expanded ? "▴" : "▾"}</span>
      </button>
      {expanded && (
        <div className="detail-tool-body">
          <pre className="detail-tool-pre">
            {JSON.stringify(tc.input, null, 2)}
          </pre>
          {tc.output && <pre className="detail-tool-pre">{tc.output}</pre>}
          {tc.uiResource && (
            <span className="detail-tool-widget-chip">
              Interactive widget (shown live in the pill)
            </span>
          )}
        </div>
      )}
    </div>
  );
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
            {msg.role === "assistant" &&
              msg.toolCalls &&
              msg.toolCalls.length > 0 && (
                <ToolCallList toolCalls={msg.toolCalls} />
              )}
            <div className="detail-turn-text">{msg.content}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
