import { useCallback, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  type ConversationEntry,
  displayToolName,
  entryParts,
  type SavedConversation,
  type StoredToolCall,
} from "../shared/types";

interface Props {
  conversation: SavedConversation;
  onClose: () => void;
  onDelete: () => void;
}

/* ---- Icons ---- */

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

function TrashIcon(): React.JSX.Element {
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
      <path d="M2 3.5h10M5 3.5V2.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1M11 3.5v8a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-8M5.5 6v4M8.5 6v4" />
    </svg>
  );
}

/* ---- Tool calls (read-only) ---- */

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

/* ---- Copy ---- */

function CopyButton({
  text,
  label,
  alwaysVisible = false,
}: {
  text: string;
  label: string;
  /** When true, the button stays visible instead of appearing on row hover. */
  alwaysVisible?: boolean;
}): React.JSX.Element {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    window.freestyle?.invoke("copy", { text });
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [text]);

  return (
    <button
      type="button"
      className={`copy-msg-btn${alwaysVisible ? " always-visible" : ""}`}
      onClick={handleCopy}
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
    </button>
  );
}

/** Serialize a conversation to Markdown for copy/share/debugging. */
function conversationToMarkdown(conv: SavedConversation): string {
  const lines: string[] = [`# ${conv.title}`, ""];
  for (const msg of conv.messages) {
    lines.push(`## ${msg.role === "user" ? "You" : "Agent"}`);
    if (msg.role === "user") {
      lines.push(msg.content, "");
      continue;
    }
    for (const part of entryParts(msg)) {
      if (part.type === "tool") {
        const tc = part.tool;
        lines.push(
          `- tool \`${displayToolName(tc.tool)}\` — input: ` +
            `\`${JSON.stringify(tc.input)}\``,
        );
        if (tc.output) lines.push(`  - output: ${tc.output}`);
      } else if (part.text) {
        lines.push(part.text);
      }
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

/* ---- Viewer ---- */

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
        <CopyButton
          text={conversationToMarkdown(conversation)}
          label="Copy whole conversation"
          alwaysVisible
        />
        <button
          type="button"
          className="icon-btn destructive"
          onClick={onDelete}
          aria-label="Delete conversation"
          title="Delete"
        >
          <TrashIcon />
        </button>
      </div>

      <div className="detail-messages">
        {conversation.messages.map((msg, i) => (
          <MessageRow key={`${msg.role}-${i}`} msg={msg} />
        ))}
      </div>
    </div>
  );
}

function MessageRow({ msg }: { msg: ConversationEntry }): React.JSX.Element {
  return (
    <div className="detail-turn">
      <div className="detail-turn-header">
        <span className={`turn-role ${msg.role}`}>
          {msg.role === "user" ? "You" : "Agent"}
        </span>
        <CopyButton text={msg.content} label="Copy message" />
      </div>
      {msg.role === "user" ? (
        <div className="detail-turn-text markdown">
          <Markdown remarkPlugins={[remarkGfm]}>{msg.content}</Markdown>
        </div>
      ) : (
        entryParts(msg).map((part, i) =>
          part.type === "tool" ? (
            <div className="detail-tools" key={part.tool.callId || `t${i}`}>
              <ArchivedToolCall tc={part.tool} />
            </div>
          ) : (
            <div className="detail-turn-text markdown" key={`x${i}`}>
              <Markdown remarkPlugins={[remarkGfm]}>{part.text}</Markdown>
            </div>
          ),
        )
      )}
    </div>
  );
}
