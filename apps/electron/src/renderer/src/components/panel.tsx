import "../overlay.css";
import "../tavern.css";

import { useChat } from "@ai-sdk/react";
import { AttentionHome } from "@renderer/components/attention-home";
import { Capabilities } from "@renderer/components/capabilities";
import { ConnectSuggestions } from "@renderer/components/connect-suggestions";
import { Markdown } from "@renderer/components/markdown";
import { OnboardingGate, useOnboarding } from "@renderer/components/onboarding";
import { OpenerCards } from "@renderer/components/opener-cards";
import {
  type RemixContextKind,
  RemixContextRail,
  useRemixContextRailVisibility,
} from "@renderer/components/remix-context-rail";
import { useRemixSession } from "@renderer/components/remix-session-context";
import { Spark } from "@renderer/components/spark";
import { ThreadHistory } from "@renderer/components/thread-history";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@renderer/components/ui/dropdown-menu";
import {
  agentWorkDuration,
  toolActivityParts,
} from "@renderer/lib/agent-activity";
import { readAgentBrief } from "@renderer/lib/agent-brief";
import {
  type AgentToolCall,
  agentToolTier,
  DECLINED_OUTPUT,
  describeAgentAction,
  executeAgentTool,
  reportAgentToolResult,
  requestAgentFileSaveGrant,
} from "@renderer/lib/agent-tools";
import { capture } from "@renderer/lib/analytics";
import { apiFetch } from "@renderer/lib/api";
import { useCloudAuth } from "@renderer/lib/auth-context";
import { resetBrainCache } from "@renderer/lib/brain-fs";
import { composerAction } from "@renderer/lib/composer-action";
import { seedMessageFor } from "@renderer/lib/onboarding-core";
import {
  connectorConnectionsQueryOptions,
  invalidateThreads,
  prependThreadToHistory,
  queryKeys,
} from "@renderer/lib/query";
import { useSpriteEmitter } from "@renderer/lib/sprite-emitter";
import {
  cancelDurableTurn,
  type DurableThreadAction,
  displayThreadTitle,
  getThreadRuntime,
  sendDurableTurnCommand,
  type ThreadState,
  type ThreadSummary,
} from "@renderer/lib/threads";
import { highlightToolJson, toolJson } from "@renderer/lib/tool-json";
import {
  connectorToolkitSlug,
  type ToolPhase,
  toolPresentation,
} from "@renderer/lib/tool-presentation";
import { compactActivitySummary } from "@renderer/lib/workspace-navigation";
import { SpriteBadge } from "@renderer/sprites/badge";
import { type CompanionForm, DEFAULT_COMPANION_FORM } from "@shared/companion";
import { PANEL_MAX_WIDTH, PANEL_MIN_WIDTH } from "@shared/panel";
import { SPRITES_INFO } from "@shared/sprites";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
  type UIMessage,
} from "ai";
import {
  Check,
  Copy,
  Ellipsis,
  Pencil,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";

type WorkspaceView = "chat" | "history";

type WorkspaceIconName =
  | "history"
  | "close"
  | "context"
  | "plus"
  | "send"
  | "stop";
const WORKSPACE_VIEW_LABELS: Record<WorkspaceView, string> = {
  chat: "Chat",
  history: "History",
};

const WORKSPACE_TOP_VIEWS: WorkspaceView[] = ["chat", "history"];

/** A small, consistent icon set for the compact workspace controls. */
function WorkspaceIcon({
  name,
}: {
  name: WorkspaceIconName;
}): React.JSX.Element {
  const paths: Record<WorkspaceIconName, React.ReactNode> = {
    history: (
      <>
        <path d="M4.5 8.5A8 8 0 1 1 4 13" />
        <path d="M4 4v4.5h4.5M12 7.5V12l3 2" />
      </>
    ),
    close: <path d="m7 7 10 10M17 7 7 17" />,
    context: (
      <>
        <rect x="4" y="5" width="16" height="14" rx="1.5" />
        <path d="M14 5v14M7.5 9h3M7.5 12h3M7.5 15h3" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    send: <path d="M12 18V6m0 0-4 4m4-4 4 4" />,
    stop: <rect x="7.5" y="7.5" width="9" height="9" rx="1.2" />,
  };

  return (
    <svg
      className="tavern-workspace-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}

function ShikiJson({ value }: { value: unknown }): React.JSX.Element {
  const source = toolJson(value);
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setHtml(null);
    void highlightToolJson(source)
      .then((highlighted) => {
        if (active) setHtml(highlighted);
      })
      .catch(() => {
        // A readable, unhighlighted JSON block remains available on failure.
      });
    return () => {
      active = false;
    };
  }, [source]);

  if (!html) {
    return (
      <pre className="tavern-tool-code">
        <code>{source}</code>
      </pre>
    );
  }

  return (
    <div
      className="tavern-tool-code"
      // Shiki renders escaped source code; tool-json.test.ts guards this contract.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function ToolMark({ partType }: { partType: string }): React.JSX.Element {
  const slug = connectorToolkitSlug(partType);
  const [failed, setFailed] = useState(false);
  const connections = useQuery(connectorConnectionsQueryOptions());
  const logo = slug
    ? (connections.data?.find((connection) => connection.toolkitSlug === slug)
        ?.toolkitLogo ?? null)
    : null;

  if (!logo || failed) {
    return (
      <span className="tavern-tool-mark" aria-hidden="true">
        ✦
      </span>
    );
  }
  return (
    <img
      className="tavern-tool-icon"
      src={logo}
      alt=""
      aria-hidden="true"
      onError={() => setFailed(true)}
    />
  );
}

function ToolChip({
  partType,
  input,
  output,
  phase = "done",
}: {
  partType: string;
  input: unknown;
  output: unknown;
  phase?: ToolPhase;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const presentation = toolPresentation(partType, phase, input, output);
  const running = phase === "running";
  const hasInput =
    input !== undefined &&
    input !== null &&
    (typeof input !== "object" || Object.keys(input).length > 0);
  const hasOutput =
    output !== undefined &&
    output !== null &&
    (typeof output !== "object" ||
      Object.keys(output).some((key) => key !== "ok"));
  const canExpand = hasInput || hasOutput || running;

  const tone = running
    ? " is-running"
    : phase === "declined" || phase === "failed"
      ? " is-inert"
      : "";

  return (
    <div className={`tavern-tool${tone}`}>
      <button
        type="button"
        className="tavern-tool-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        disabled={!canExpand}
      >
        <ToolMark partType={partType} />
        <span className="tavern-tool-label">
          {presentation.title}
          {presentation.detail ? ` · ${presentation.detail}` : ""}
        </span>
        {running ? (
          <span
            className="tavern-tool-spinner"
            role="status"
            aria-label="Working"
          />
        ) : null}
        {canExpand ? (
          <span className="tavern-tool-caret" aria-hidden="true">
            {open ? "▾" : "▸"}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="tavern-tool-detail">
          {hasInput ? (
            <>
              <span className="tavern-tool-heading">Request</span>
              <ShikiJson value={input} />
            </>
          ) : null}
          {hasOutput ? (
            <>
              <span className="tavern-tool-heading">Result</span>
              <ShikiJson value={output} />
            </>
          ) : running ? (
            <>
              <span className="tavern-tool-heading">Result</span>
              <span className="tavern-tool-waiting">Working…</span>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function ToolActivity({
  parts,
  elapsedMs,
}: {
  parts: UIMessage["parts"];
  elapsedMs: number | null;
}): React.JSX.Element | null {
  const tools = parts.filter(
    (part) =>
      part.type.startsWith("tool-") && part.type !== "tool-suggest_connections",
  );
  if (tools.length === 0) return null;

  const items = tools.map((part) => {
    const tool = part as {
      state?: string;
      input?: unknown;
      output?: { ok?: boolean; reason?: string };
    };
    const phase: ToolPhase =
      tool.state === "input-streaming" || tool.state === "input-available"
        ? "running"
        : tool.state === "output-error"
          ? "failed"
          : tool.output?.ok === false
            ? tool.output.reason === "user-declined"
              ? "declined"
              : "failed"
            : "done";
    return {
      part,
      input: tool.input,
      output: tool.output,
      phase,
      title: toolPresentation(part.type, phase, tool.input, tool.output).title,
    };
  });
  const summary = compactActivitySummary(items, elapsedMs);

  return (
    <details className="tavern-tool-activity" open={summary.running}>
      <summary>
        <span className="tavern-tool-mark" aria-hidden="true">
          ✦
        </span>
        <span>
          {summary.running ? "Working · " : ""}
          {summary.label}
        </span>
        {summary.running ? (
          <span
            className="tavern-tool-spinner"
            role="status"
            aria-label="Working"
          />
        ) : null}
      </summary>
      <div className="tavern-tool-activity-list">
        {items.map(({ part, input, output, phase }, index) => (
          <ToolChip
            key={`${part.type}-${index}`}
            partType={part.type}
            input={input}
            output={output}
            phase={phase}
          />
        ))}
      </div>
    </details>
  );
}

function AgentBriefCard({
  brief,
}: {
  brief: NonNullable<ReturnType<typeof readAgentBrief>>;
}): React.JSX.Element {
  return (
    <section className="tavern-agent-brief" aria-label="Brief">
      <div className="tavern-agent-brief-headline">
        <Markdown text={brief.headline} />
      </div>
      {brief.summary ? (
        <div className="tavern-agent-brief-summary">
          <Markdown text={brief.summary} />
        </div>
      ) : null}
      {brief.points.length > 0 ? (
        <ul>
          {brief.points.map((point) => (
            <li key={point}>
              <Markdown text={point} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function isPlaceholderText(text: string): boolean {
  return text.trim() === "...";
}

function messageText(message: UIMessage): string {
  return message.parts
    .flatMap((part) =>
      part.type === "text" && !isPlaceholderText(part.text) && part.text
        ? [part.text]
        : [],
    )
    .join("\n\n");
}

function MessageActions({
  role,
  copied,
  disabled,
  onCopy,
  onEdit,
  onRegenerate,
}: {
  role: UIMessage["role"];
  copied: boolean;
  disabled: boolean;
  onCopy: () => void;
  onEdit?: () => void;
  onRegenerate?: () => void;
}): React.JSX.Element {
  return (
    <div className="tavern-msg-actions">
      <button
        type="button"
        className={`tavern-msg-action${copied ? " is-copied" : ""}`}
        onClick={onCopy}
        aria-label={copied ? "Message copied" : "Copy message"}
        title={copied ? "Copied" : "Copy message"}
      >
        {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
      </button>
      {role === "user" && onEdit ? (
        <button
          type="button"
          className="tavern-msg-action"
          disabled={disabled}
          onClick={onEdit}
          aria-label="Edit and resend message"
          title="Edit and resend"
        >
          <Pencil aria-hidden="true" />
        </button>
      ) : null}
      {role === "assistant" && onRegenerate ? (
        <button
          type="button"
          className="tavern-msg-action"
          disabled={disabled}
          onClick={onRegenerate}
          aria-label="Regenerate response"
          title="Regenerate response"
        >
          <RotateCcw aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

function ChatMessage({
  message,
  copied,
  disabled,
  editing,
  editDraft,
  onCopy,
  onEdit,
  onEditDraftChange,
  onCancelEdit,
  onResendEdit,
  onRegenerate,
}: {
  message: UIMessage;
  copied: boolean;
  disabled: boolean;
  editing: boolean;
  editDraft: string;
  onCopy: () => void;
  onEdit: () => void;
  onEditDraftChange: (text: string) => void;
  onCancelEdit: () => void;
  onResendEdit: () => void;
  onRegenerate: () => void;
}): React.JSX.Element {
  const text = messageText(message);
  const brief = readAgentBrief(message.parts);
  const activityParts = toolActivityParts(message.parts);
  const activityAnchor = activityParts[0];
  const elapsedMs = agentWorkDuration(message.metadata);
  const editInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) editInputRef.current?.focus();
  }, [editing]);

  if (message.role === "user") {
    return (
      <div className="tavern-msg tavern-msg-user-wrap">
        {editing ? (
          <div className="tavern-msg-edit">
            <textarea
              className="tavern-msg-edit-input"
              value={editDraft}
              rows={2}
              ref={editInputRef}
              aria-label="Edit message"
              onMouseDown={() => window.api.panelRequestFocus()}
              onChange={(event) => onEditDraftChange(event.target.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  onResendEdit();
                }
              }}
            />
            <div className="tavern-msg-edit-actions">
              <button type="button" onClick={onCancelEdit}>
                Cancel
              </button>
              <button
                type="button"
                className="is-primary"
                disabled={!editDraft.trim() || disabled}
                onClick={onResendEdit}
              >
                Send again
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="tavern-msg-user">{text}</div>
            <MessageActions
              role={message.role}
              copied={copied}
              disabled={disabled}
              onCopy={onCopy}
              onEdit={onEdit}
            />
          </>
        )}
      </div>
    );
  }

  return (
    <div className="tavern-msg tavern-msg-assistant-wrap">
      <div className="tavern-msg-assistant-content">
        {message.parts.map((part, i) => {
          if (part.type === "text") {
            if (brief || !part.text || isPlaceholderText(part.text))
              return null;
            return (
              <div key={`${message.id}-${i}`} className="tavern-msg-assistant">
                <Markdown text={part.text} />
              </div>
            );
          }
          if (part.type === "tool-suggest_connections") {
            const tool = part as { state?: string; output?: unknown };
            if (tool.state !== "output-available") return null;
            return (
              <ConnectSuggestions
                key={`${message.id}-${i}`}
                output={tool.output}
              />
            );
          }
          if (part.type === "data-brief") {
            return brief ? (
              <AgentBriefCard key={`${message.id}-${i}`} brief={brief} />
            ) : null;
          }
          if (part.type.startsWith("tool-")) {
            return part === activityAnchor ? (
              <ToolActivity
                key={`${message.id}-${i}`}
                parts={activityParts}
                elapsedMs={elapsedMs}
              />
            ) : null;
          }
          return null;
        })}
      </div>
      {text ? (
        <MessageActions
          role={message.role}
          copied={copied}
          disabled={disabled}
          onCopy={onCopy}
          onRegenerate={onRegenerate}
        />
      ) : null}
    </div>
  );
}

function newThread(): ThreadState {
  return { id: crypto.randomUUID(), messages: [] };
}

function durableDesktopClientId(): string {
  const key = "freestyle.durable-desktop-client-id";
  const existing = window.localStorage.getItem(key);
  if (existing) return existing;
  const next = `desktop-${crypto.randomUUID()}`;
  window.localStorage.setItem(key, next);
  return next;
}

function touchesBrain(message: UIMessage): boolean {
  return message.parts.some(
    (part) =>
      part.type === "tool-brain_write" ||
      part.type === "tool-brain_edit" ||
      part.type === "tool-brain_delete",
  );
}

function touchesScheduled(message: UIMessage): boolean {
  return message.parts.some(
    (part) =>
      part.type === "tool-scheduled_task_create" ||
      part.type === "tool-scheduled_task_update" ||
      part.type === "tool-scheduled_task_delete",
  );
}

function contextKindFor(message: UIMessage): RemixContextKind | null {
  if (touchesScheduled(message)) return "tasks";
  if (!touchesBrain(message)) return null;

  const detail = JSON.stringify(message.parts);
  if (detail.includes("todos.md")) return "tasks";
  if (detail.includes("notes/")) return "notes";
  return "brain";
}

function PanelTail(): React.JSX.Element {
  // A manga balloon tail. The card fill reaches up through the panel's border
  // and hard shadow so the bubble opens into the tail; the ink stroke draws
  // only the two side curves, meeting the border's cut ends with round caps.
  return (
    <svg
      className="tavern-tail"
      viewBox="0 0 56 46"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M12 3 L12 5.5 C15.5 15 17.5 28 17 41 C27 27 37 15 44 5.5 L44 3 Z"
        fill="var(--tavern-card)"
      />
      <path
        d="M12 5.5 C15.5 15 17.5 28 17 41 C27 27 37 15 44 5.5"
        fill="none"
        stroke="var(--tavern-ink)"
        strokeWidth="3"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function PanelResizeHandle(): React.JSX.Element {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);
  const frame = useRef<number | null>(null);
  const pending = useRef<number | null>(null);

  const widthFor = (e: React.PointerEvent<HTMLDivElement>): number => {
    const d = drag.current;
    if (!d) return window.innerWidth;
    const next = d.startWidth + (e.screenX - d.startX);
    return Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, next));
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!drag.current) return;
    const width = widthFor(e);
    drag.current = null;
    pending.current = null;
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    window.api.panelResizeWidth(width);
    window.api.panelCommitWidth();
  };

  return (
    <div
      className="tavern-resize-handle"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { startX: e.screenX, startWidth: window.innerWidth };
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        pending.current = widthFor(e);
        if (frame.current !== null) return;
        frame.current = requestAnimationFrame(() => {
          frame.current = null;
          if (pending.current === null) return;
          window.api.panelResizeWidth(pending.current);
          pending.current = null;
        });
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    />
  );
}

function SignInGate(): React.JSX.Element {
  const auth = useCloudAuth();
  return (
    <div className="tavern-gate">
      <button
        type="button"
        className="tavern-close tavern-gate-close"
        aria-label="Close"
        onClick={() => window.api.panelClose()}
      >
        <WorkspaceIcon name="close" />
      </button>
      <div className="tavern-gate-body">
        <div className="tavern-gate-lockup">
          <span className="tavern-gate-spark" />
          <span className="tavern-gate-wordmark">
            freestyle<span className="tavern-gate-accent">.</span>
          </span>
        </div>
        <h1 className="tavern-gate-heading">The intelligent reminders app.</h1>
        <p className="tavern-gate-sub">Sign in to your Freestyle account</p>
        {auth.signingIn ? (
          <>
            <div className="tavern-gate-code">{auth.userCode ?? "…"}</div>
            <p className="tavern-gate-sub is-small">
              Check that your browser shows this code, then finish signing in
              there.
            </p>
            <button
              type="button"
              className="tavern-approve-btn"
              onClick={() => auth.cancelSignIn()}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            className="tavern-gate-btn"
            onClick={() => void auth.signIn()}
          >
            Continue in browser
          </button>
        )}
        {auth.sessionExpired && !auth.signingIn ? (
          <p className="tavern-gate-sub is-small">
            Your session expired — sign in again to pick up where you left off.
          </p>
        ) : null}
        {auth.error ? <p className="tavern-notice">{auth.error}</p> : null}
      </div>
      <p className="tavern-gate-terms">
        By continuing, you agree to our{" "}
        <button
          type="button"
          className="tavern-gate-link"
          onClick={() =>
            void window.api.openExternal("https://freestylevoice.com/terms")
          }
        >
          Terms
        </button>{" "}
        and{" "}
        <button
          type="button"
          className="tavern-gate-link"
          onClick={() =>
            void window.api.openExternal("https://freestylevoice.com/privacy")
          }
        >
          Privacy Policy
        </button>
        .
      </p>
    </div>
  );
}

/**
 * The current durable agent runtime in a desktop-sized composition. The
 * compact panel and the restored dashboard deliberately share this component
 * so streaming, approvals, connected apps, and thread persistence remain one
 * implementation.
 */
export function RemixWorkspace(): React.JSX.Element {
  const {
    thread,
    switchThread,
    selectThread,
    isThreadLoading,
    threadLoadError,
    retryThreadLoad,
    localTitles,
    renameThread,
    deleteThread,
  } = useRemixSession();

  if (!thread) return <div className="remix-workspace" />;

  return (
    <div className="remix-workspace">
      <PanelInner
        thread={thread}
        onSwitchThread={switchThread}
        onSelectThread={selectThread}
        isSessionLoading={isThreadLoading}
        sessionLoadError={threadLoadError}
        onRetrySessionLoad={retryThreadLoad}
        onRenameSession={renameThread}
        onDeleteSession={deleteThread}
        sessionTitle={localTitles[thread.id] ?? displayThreadTitle(thread)}
        desktop
      />
    </div>
  );
}

export function PanelNotificationAuthBridge({
  children,
}: {
  children: React.ReactNode;
}): React.JSX.Element {
  const auth = useCloudAuth();
  const authChangeKey = auth.loading ? null : (auth.user?.id ?? "signed-out");

  useEffect(() => {
    if (authChangeKey === null) return;
    window.api.notificationAuthChanged();
  }, [authChangeKey]);

  return <>{children}</>;
}

function RemixChatHeader({
  thread,
  title,
  onRename,
  onDelete,
  children,
}: {
  thread: ThreadState;
  title: string;
  onRename?: (threadId: string, title: string) => Promise<void>;
  onDelete?: (threadId: string) => Promise<void>;
  children: React.ReactNode;
}): React.JSX.Element {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(title);
  const [actionError, setActionError] = useState<string | null>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!renaming) setDraft(title);
  }, [renaming, title]);

  useEffect(() => {
    if (renaming) renameInputRef.current?.focus();
  }, [renaming]);

  const saveTitle = (): void => {
    const nextTitle = draft.trim();
    if (!nextTitle) {
      setActionError("A session needs a name.");
      return;
    }
    if (!onRename) return;
    setActionError(null);
    void onRename(thread.id, nextTitle)
      .then(() => setRenaming(false))
      .catch(() => setActionError("Couldn’t rename this session."));
  };

  const deleteSession = (): void => {
    if (!onDelete) return;
    if (!window.confirm(`Delete “${title}”? This can’t be undone.`)) return;
    setActionError(null);
    // Session deletion owns its optimistic rollback and failure toast in the
    // session provider, so this header never waits for the network round-trip.
    void onDelete(thread.id).catch(() => {});
  };

  return (
    <header className="remix-chat-header">
      <div className="remix-chat-session">
        {renaming ? (
          <form
            className="remix-chat-title-edit"
            onSubmit={(event) => {
              event.preventDefault();
              saveTitle();
            }}
          >
            <input
              ref={renameInputRef}
              value={draft}
              aria-label="Session name"
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                event.preventDefault();
                setActionError(null);
                setRenaming(false);
              }}
            />
            <button type="submit" aria-label="Save session name">
              <Check aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label="Cancel rename"
              onClick={() => {
                setActionError(null);
                setRenaming(false);
              }}
            >
              <X aria-hidden="true" />
            </button>
          </form>
        ) : (
          <>
            <h1 title={title}>{title}</h1>
            {thread.messages.length > 0 && onRename && onDelete ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="remix-chat-session-actions"
                    aria-label={`Session actions for ${title}`}
                    title="Session actions"
                  >
                    <Ellipsis aria-hidden="true" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="min-w-35">
                  <DropdownMenuItem
                    onSelect={() => {
                      setDraft(title);
                      setActionError(null);
                      setRenaming(true);
                    }}
                  >
                    <Pencil aria-hidden="true" />
                    Rename
                  </DropdownMenuItem>
                  {thread.messages.length > 0 ? (
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={deleteSession}
                    >
                      <Trash2 aria-hidden="true" />
                      Delete
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </>
        )}
        {actionError ? (
          <p className="remix-chat-session-error" role="status">
            {actionError}
          </p>
        ) : null}
      </div>
      <div className="remix-chat-header-actions">{children}</div>
    </header>
  );
}

function ConversationSkeleton(): React.JSX.Element {
  return (
    <div
      className="remix-conversation-skeleton"
      role="status"
      aria-live="polite"
      aria-label="Loading conversation"
    >
      <span className="remix-conversation-skeleton-line is-user" />
      <span className="remix-conversation-skeleton-line is-assistant" />
      <span className="remix-conversation-skeleton-line is-assistant-short" />
      <span className="sr-only">Loading conversation</span>
    </div>
  );
}

function PanelInner({
  thread,
  onSwitchThread,
  onSelectThread,
  isSessionLoading = false,
  sessionLoadError = null,
  onRetrySessionLoad,
  onRenameSession,
  onDeleteSession,
  sessionTitle: currentSessionTitle,
  desktop = false,
}: {
  thread: ThreadState;
  onSwitchThread: (thread: ThreadState) => void;
  onSelectThread?: (thread: ThreadSummary) => void;
  isSessionLoading?: boolean;
  sessionLoadError?: string | null;
  onRetrySessionLoad?: () => void;
  onRenameSession?: (threadId: string, title: string) => Promise<void>;
  onDeleteSession?: (threadId: string) => Promise<void>;
  sessionTitle?: string;
  /** Render inside the restored full-window Remix workspace rather than a popover. */
  desktop?: boolean;
}): React.JSX.Element {
  const [tab, setTab] = useState<WorkspaceView>("chat");
  const [contextRailOpen, setContextRailOpen] = useRemixContextRailVisibility();
  const [narrowRemix, setNarrowRemix] = useState(
    () => window.matchMedia("(max-width: 1080px)").matches,
  );
  const [narrowContextOpen, setNarrowContextOpen] = useState(false);
  const [contextAttention, setContextAttention] =
    useState<RemixContextKind | null>(null);
  const queryClient = useQueryClient();
  const auth = useCloudAuth();
  const onboarding = useOnboarding(!!auth.user);
  const [spriteForm, setSpriteForm] = useState<CompanionForm>(
    DEFAULT_COMPANION_FORM,
  );

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1080px)");
    const update = (): void => setNarrowRemix(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (narrowRemix) setNarrowContextOpen(false);
  }, [narrowRemix]);

  useEffect(() => {
    void window.api
      .companionForm()
      .then(setSpriteForm)
      .catch(() => {});
    const offForm = window.api.onCompanionForm(setSpriteForm);
    return () => offForm?.();
  }, []);

  const [updateStatus, setUpdateStatus] = useState<{
    version: string | null;
    downloadState: "idle" | "downloading" | "downloaded";
  }>({ version: null, downloadState: "idle" });

  useEffect(() => {
    void window.api
      .getUpdateStatus()
      .then(setUpdateStatus)
      .catch(() => {});
    const offUpdate = window.api.onUpdateStatus(setUpdateStatus);
    return () => offUpdate?.();
  }, []);
  const [draft, setDraft] = useState("");

  const [notice, setNotice] = useState<string | null>(null);
  const [approvals, setApprovals] = useState<
    Array<{
      call: AgentToolCall;
      durable?: { turnId: string; actionId: string };
    }>
  >([]);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [capabilitiesOpen, setCapabilitiesOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const dictationBaseRef = useRef<string | null>(null);
  const contextAttentionMessageRef = useRef<string | null>(null);
  // Whether the current draft arrived by voice, so message_sent can say so.
  const dictatedRef = useRef(false);

  const durableRuntime = useQuery({
    queryKey: ["durable-thread-runtime", thread.id],
    queryFn: () => getThreadRuntime(thread.id),
    enabled: !isSessionLoading,
    retry: false,
    refetchInterval: (query) =>
      query.state.data?.activeTurn || query.state.data?.pendingAction
        ? 1_000
        : false,
  });

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/agent",
        body: { threadId: thread.id },
        fetch: ((input: string | URL | Request, init?: RequestInit) =>
          apiFetch(
            typeof input === "string" ? input : "/api/agent",
            init ?? {},
          )) as typeof fetch,
      }),
    [thread.id],
  );

  const {
    messages,
    sendMessage,
    regenerate,
    stop,
    status,
    addToolOutput,
    setMessages,
  } = useChat({
    id: thread.id,
    messages: thread.messages,
    transport,
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onFinish: ({ messages: finished }) => {
      queryClient.setQueryData(queryKeys.threads.detail(thread.id), {
        id: thread.id,
        messages: finished,
      });
      void invalidateThreads(queryClient);
      void queryClient.invalidateQueries({ queryKey: queryKeys.attention });
      if (finished.length === 0) return;
      const last = finished[finished.length - 1];
      if (last?.role !== "assistant") return;
      if (touchesBrain(last)) {
        resetBrainCache();
        void queryClient.invalidateQueries({ queryKey: queryKeys.brain.all });
      }
      if (touchesScheduled(last)) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.scheduled.tasks,
        });
      }
      const contextKind = contextKindFor(last);
      if (contextKind) {
        contextAttentionMessageRef.current = last.id;
        setContextAttention(contextKind);
      }
    },
    onToolCall: async ({ toolCall }) => {
      const startedAt = Date.now();
      const call: AgentToolCall = {
        toolName: toolCall.toolName,
        toolCallId: toolCall.toolCallId,
        input: toolCall.input,
      };
      const tier = await agentToolTier(call);
      if (tier === "confirmed") {
        setApprovals((prev) => [...prev, { call }]);
        return;
      }
      const output =
        tier === "free"
          ? await executeAgentTool(call)
          : { ok: false, reason: `unknown tool: ${call.toolName}` };
      reportAgentToolResult(call, output, startedAt);
      addToolOutput({
        tool: toolCall.toolName,
        toolCallId: toolCall.toolCallId,
        output,
      });
    },
    onError: (err) => {
      const message = typeof err.message === "string" ? err.message : "";
      setNotice(
        message.includes("cloud_auth_required") || message.includes("401")
          ? "Sign in to Freestyle Cloud to chat."
          : message.includes("thread_too_long")
            ? "This conversation is too long to continue. Start a new one from the menu."
            : message && message !== "[object Object]"
              ? message
              : "That didn't go through. Try again.",
      );
    },
  });

  const resetThreadRef = useRef(thread.id);
  useEffect(() => {
    if (resetThreadRef.current === thread.id) return;
    resetThreadRef.current = thread.id;
    setTab("chat");
    setDraft("");
    setNotice(null);
    setApprovals([]);
    setCopiedMessageId(null);
    setEditingMessageId(null);
    setEditDraft("");
    setContextAttention(null);
    contextAttentionMessageRef.current = null;
    setCapabilitiesOpen(false);
    dictationBaseRef.current = null;
    dictatedRef.current = false;
  }, [thread.id]);

  // `useChat` retains message state across prop changes. Clear the previous
  // conversation as soon as a different session is selected so stale content
  // can never flash underneath this session's loading skeleton.
  const chatThreadRef = useRef(thread.id);
  useEffect(() => {
    if (chatThreadRef.current === thread.id) return;
    chatThreadRef.current = thread.id;
    setMessages(thread.messages);
  }, [setMessages, thread.id, thread.messages]);

  useEffect(() => {
    if (!contextAttention) return;
    const timeout = window.setTimeout(() => setContextAttention(null), 3_000);
    return () => window.clearTimeout(timeout);
  }, [contextAttention]);

  useEffect(() => {
    const last = durableRuntime.data?.thread?.messages.at(-1);
    if (
      !last ||
      last.role !== "assistant" ||
      last.id === contextAttentionMessageRef.current
    )
      return;
    const contextKind = contextKindFor(last);
    if (!contextKind) return;
    contextAttentionMessageRef.current = last.id;
    setContextAttention(contextKind);
  }, [durableRuntime.data?.thread?.messages]);

  useEffect(() => {
    if (status === "submitted" || status === "streaming") return;
    if (thread.messages.length > messages.length) setMessages(thread.messages);
  }, [thread.messages, messages.length, setMessages, status]);

  useEffect(() => {
    const synced = durableRuntime.data?.thread;
    if (!synced || status === "submitted" || status === "streaming") return;
    if (synced.messages.length >= messages.length) setMessages(synced.messages);
  }, [durableRuntime.data?.thread, messages.length, setMessages, status]);

  const startedRef = useRef(thread.messages.length > 0);
  const startedThreadRef = useRef(thread.id);
  useEffect(() => {
    if (startedThreadRef.current === thread.id) return;
    startedThreadRef.current = thread.id;
    startedRef.current = thread.messages.length > 0;
  }, [thread.id, thread.messages.length]);
  useEffect(() => {
    if (startedRef.current || messages.length === 0) return;
    startedRef.current = true;
    prependThreadToHistory(queryClient, {
      id: thread.id,
      title: "New conversation",
      updatedAt: Date.now(),
      origin: "user",
    });
  }, [messages.length, queryClient, thread.id]);

  const busy = status === "submitted" || status === "streaming";
  const action = composerAction(status);
  // The spark loader holds the floor until the first response text streams in;
  // once text is flowing, the growing message itself is the indicator.
  const lastMessage = messages[messages.length - 1];
  const awaitingText =
    status === "submitted" ||
    (status === "streaming" &&
      (!lastMessage ||
        lastMessage.role !== "assistant" ||
        !messageText(lastMessage)));

  useSpriteEmitter(messages, approvals.length, busy);

  const send = (): void => {
    const text = draft.trim();
    if (
      !text ||
      tab !== "chat" ||
      busy ||
      approvals.length > 0 ||
      isSessionLoading ||
      sessionLoadError
    )
      return;
    capture("message_sent", {
      source: dictatedRef.current ? "dictated" : "typed",
      chars: text.length,
      threadIsNew: messages.length === 0,
    });
    dictatedRef.current = false;
    setNotice(null);
    setDraft("");
    void sendMessage({ text });
  };

  const stopGeneration = (): void => {
    if (!busy) return;
    stop();
    const cancel = (turnId: string) =>
      void cancelDurableTurn(turnId)
        .then(() => durableRuntime.refetch())
        .catch(() =>
          setNotice(
            "Stopped locally, but couldn't cancel the server turn. Check this conversation when you're back online.",
          ),
        );
    const activeTurnId = durableRuntime.data?.activeTurn?.id;
    if (activeTurnId) {
      cancel(activeTurnId);
      return;
    }
    // The first runtime poll can trail the streamed response by a moment. A
    // one-off refetch closes that race so Stop remains server-authoritative.
    void durableRuntime
      .refetch()
      .then(({ data }) => {
        const turnId = data?.activeTurn?.id;
        if (turnId) cancel(turnId);
      })
      .catch(() => {});
  };

  const copyMessage = (message: UIMessage): void => {
    const text = messageText(message);
    if (!text) return;
    void window.api
      .remixSetClipboard(text)
      .then((result) => {
        if (!result.ok) throw new Error("copy-failed");
        setCopiedMessageId(message.id);
        window.setTimeout(
          () =>
            setCopiedMessageId((current) =>
              current === message.id ? null : current,
            ),
          1_500,
        );
      })
      .catch(() => setNotice("Could not copy that message."));
  };

  const startEditingMessage = (message: UIMessage): void => {
    const text = messageText(message);
    if (message.role !== "user" || !text || busy || approvals.length > 0)
      return;
    setEditingMessageId(message.id);
    setEditDraft(text);
  };

  const cancelEditingMessage = (): void => {
    setEditingMessageId(null);
    setEditDraft("");
  };

  const resendEditedMessage = (): void => {
    const text = editDraft.trim();
    if (!editingMessageId || !text || busy || approvals.length > 0) return;
    const messageId = editingMessageId;
    cancelEditingMessage();
    setNotice(null);
    void sendMessage({ text, messageId }).catch(() => {
      setNotice("Could not resend that message.");
    });
  };

  const regenerateMessage = (message: UIMessage): void => {
    if (message.role !== "assistant" || busy || approvals.length > 0) return;
    setNotice(null);
    void regenerate({ messageId: message.id }).catch(() => {
      setNotice("Could not regenerate that response.");
    });
  };

  const resolveApproval = (
    approval: {
      call: AgentToolCall;
      durable?: { turnId: string; actionId: string };
    },
    allowed: boolean,
  ): void => {
    const call = approval.call;
    capture("approval_resolved", { tool: call.toolName, allowed });
    setApprovals((prev) =>
      prev.filter((item) => item.call.toolCallId !== call.toolCallId),
    );
    void (async () => {
      const startedAt = Date.now();
      const grant =
        allowed && call.toolName === "save_file"
          ? await requestAgentFileSaveGrant(call)
          : null;
      const output = !allowed
        ? DECLINED_OUTPUT
        : grant && grant.ok !== true
          ? grant
          : await executeAgentTool(call, {
              saveFileGrant:
                grant && typeof grant.grant === "string"
                  ? grant.grant
                  : undefined,
            });
      reportAgentToolResult(call, output, startedAt);
      if (approval.durable) {
        await sendDurableTurnCommand(approval.durable.turnId, {
          type: "desktop_complete",
          actionId: approval.durable.actionId,
          clientId: durableDesktopClientId(),
          result: output,
        });
        void queryClient.invalidateQueries({ queryKey: queryKeys.attention });
        await durableRuntime.refetch();
      } else {
        addToolOutput({
          tool: call.toolName,
          toolCallId: call.toolCallId,
          output,
        });
      }
    })();
  };

  const resolveDurableConnector = (
    action: DurableThreadAction,
    allowed: boolean,
  ): void => {
    void sendDurableTurnCommand(action.turnId, {
      type: allowed ? "approve" : "decline",
      actionId: action.id,
    })
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: queryKeys.attention });
        return durableRuntime.refetch();
      })
      .catch(() => setNotice("Couldn't resolve this connected-app action."));
  };

  const claimDurableDesktopAction = (action: DurableThreadAction): void => {
    void (async () => {
      const response = (await sendDurableTurnCommand(action.turnId, {
        type: "desktop_claim",
        actionId: action.id,
        clientId: durableDesktopClientId(),
        client: {
          platform: window.api.platform,
          supportsDownloadsSave: true,
        },
      })) as { action?: { id?: string; toolName?: string; input?: unknown } };
      if (!response.action?.id || !response.action.toolName) {
        throw new Error("The desktop action was no longer available.");
      }
      const call: AgentToolCall = {
        toolCallId: response.action.id,
        toolName: response.action.toolName,
        input: response.action.input,
      };
      const tier = await agentToolTier(call);
      if (tier === "confirmed") {
        setApprovals((previous) => [
          ...previous,
          { call, durable: { turnId: action.turnId, actionId: action.id } },
        ]);
        return;
      }
      const output =
        tier === "free"
          ? await executeAgentTool(call)
          : { ok: false, reason: `unknown tool: ${call.toolName}` };
      reportAgentToolResult(call, output, Date.now());
      await sendDurableTurnCommand(action.turnId, {
        type: "desktop_complete",
        actionId: action.id,
        clientId: durableDesktopClientId(),
        result: output,
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.attention });
      await durableRuntime.refetch();
    })().catch(() => setNotice("Couldn't run that desktop action."));
  };

  useEffect(() => {
    // Every tab renders into the same .tavern-body scroller, so without this
    // guard a streaming turn yanks Settings/History/Brain to the bottom.
    if (!desktop && tab !== "chat") return;
    const el = bodyRef.current;
    if (el && (messages.length > 0 || approvals.length > 0))
      el.scrollTop = el.scrollHeight;
  }, [desktop, messages, approvals, tab]);

  const pinned = busy || approvals.length > 0;
  useEffect(() => {
    window.api.panelSetBusy(pinned);
    return () => window.api.panelSetBusy(false);
  }, [pinned]);

  useEffect(() => {
    // The composer only exists on the chat tab — dictation and explicit
    // focus requests must surface it first.
    const showComposer = (): void => {
      setTab("chat");
    };
    const offFocus = window.api.onPanelFocusComposer(() => {
      showComposer();
      requestAnimationFrame(() =>
        document.getElementById("panel-composer")?.focus(),
      );
    });
    const offDictation = window.api.onPanelDictation((ev) => {
      if (ev.kind !== "error") showComposer();
      if (ev.kind === "error") {
        setNotice(ev.text);
        const base = dictationBaseRef.current;
        dictationBaseRef.current = null;
        if (base !== null) setDraft(base);
        return;
      }
      setNotice(null);
      if (ev.kind === "partial" || ev.kind === "final")
        dictatedRef.current = true;
      if (ev.kind === "partial") {
        // Snapshot whatever was typed before this utterance once; every
        // partial then re-renders base + live text, replacing the previous
        // partial rather than stacking on it.
        setDraft((prev) => {
          if (dictationBaseRef.current === null)
            dictationBaseRef.current = prev.trim();
          const base = dictationBaseRef.current;
          return base ? `${base} ${ev.text}` : ev.text;
        });
        return;
      }
      // Final REPLACES the partial tail — appending to the draft here would
      // duplicate the utterance, since the partials already wrote it.
      const base = dictationBaseRef.current;
      dictationBaseRef.current = null;
      setDraft((prev) => {
        const anchor = base ?? prev.trim();
        return anchor ? `${anchor} ${ev.text}` : ev.text;
      });
    });
    window.api.panelRendererReady();
    return () => {
      offFocus?.();
      offDictation?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (!desktop && e.key === "Escape") window.api.panelClose();
    };
    const onLeave = (): void => window.api.panelPointerLeft();
    const onEnter = (): void => window.api.panelPointerEntered();
    window.addEventListener("keydown", onKey);
    document.addEventListener("mouseleave", onLeave);
    document.addEventListener("mouseenter", onEnter);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mouseleave", onLeave);
      document.removeEventListener("mouseenter", onEnter);
    };
  }, [desktop]);

  const chatActive = desktop || tab === "chat";
  const contextRailVisible =
    desktop && (narrowRemix ? narrowContextOpen : contextRailOpen);
  const toggleContextRail = (): void => {
    if (narrowRemix) setNarrowContextOpen((open) => !open);
    else setContextRailOpen(!contextRailOpen);
  };
  const showChat = chatActive && messages.length > 0;
  const startNewChat = (): void => {
    setTab("chat");
    setCapabilitiesOpen(false);
    setDraft("");
    setNotice(null);
    dictationBaseRef.current = null;
    dictatedRef.current = false;
    onSwitchThread(newThread());
    requestAnimationFrame(() =>
      document.getElementById("panel-composer")?.focus(),
    );
  };

  // Signed out, the gate is the entire panel — no head, no tabs, no way to
  // reach the agent. While auth status resolves, show nothing rather than
  // flashing the gate at signed-in users.
  if (!auth.user) {
    return (
      <div className={desktop ? "remix-agent" : "tavern-shell"}>
        <div className="tavern tavern-panel">
          {auth.loading ? null : <SignInGate />}
        </div>
        {!desktop ? <PanelTail /> : null}
        {!desktop ? <PanelResizeHandle /> : null}
      </div>
    );
  }

  // First meeting: Jeb runs his intro as a takeover, same contract as the
  // sign-in gate. While the flag loads, show nothing rather than flashing
  // the intro at users who've already been through it.
  if (onboarding.status !== "done") {
    return (
      <div className={desktop ? "remix-agent" : "tavern-shell"}>
        <div className="tavern tavern-panel">
          {onboarding.status === "show" ? (
            <OnboardingGate
              user={auth.user}
              spriteForm={spriteForm}
              saved={onboarding.saved}
              onDone={(task) => {
                // The landing: the panel opens on a thread that is already
                // about the task. Replays never seed a second thread.
                const replayed = onboarding.saved?.replayed === true;
                onboarding.markDone(task);
                setTab("chat");
                if (task && !replayed) {
                  setNotice(null);
                  void sendMessage(
                    { text: seedMessageFor(task) },
                    { body: { firstTurn: true } },
                  );
                }
              }}
            />
          ) : null}
        </div>
        {!desktop ? <PanelTail /> : null}
        {!desktop ? <PanelResizeHandle /> : null}
      </div>
    );
  }

  return (
    <div className={desktop ? "remix-agent" : "tavern-shell"}>
      <div
        className={`tavern tavern-panel${desktop ? " remix-agent-panel" : ""}`}
      >
        <div className="tavern-head tavern-workspace-head">
          <SpriteBadge form={spriteForm} working={busy} size={22} />
          <span className="tavern-head-name">
            {desktop ? (
              "Remix"
            ) : (
              <>
                freestyle<i>.</i>
              </>
            )}
          </span>
          <span className="tavern-head-spacer" />
          {updateStatus.version ? (
            <button
              type="button"
              className={`tavern-head-update${
                updateStatus.downloadState === "downloaded" ? " is-ready" : ""
              }`}
              title={
                updateStatus.downloadState === "downloaded"
                  ? `Version ${updateStatus.version} is ready — restart to update`
                  : updateStatus.downloadState === "downloading"
                    ? `Version ${updateStatus.version} is downloading`
                    : `Version ${updateStatus.version} is available`
              }
              disabled={updateStatus.downloadState === "downloading"}
              onClick={() => {
                if (updateStatus.downloadState === "downloaded") {
                  window.api.installUpdate();
                } else {
                  window.api.downloadUpdate();
                }
              }}
            >
              {updateStatus.downloadState === "downloaded"
                ? "Restart to update"
                : updateStatus.downloadState === "downloading"
                  ? "Downloading…"
                  : "Update"}
            </button>
          ) : null}
          <button
            type="button"
            className="tavern-workspace-icon-btn"
            aria-label="Start new chat"
            title="New chat"
            disabled={pinned}
            onClick={startNewChat}
          >
            <WorkspaceIcon name="plus" />
          </button>
          {!desktop ? (
            <button
              type="button"
              className="tavern-workspace-icon-btn"
              aria-label="Open conversations"
              aria-pressed={tab === "history"}
              onClick={() => {
                setTab("history");
              }}
            >
              <WorkspaceIcon name="history" />
            </button>
          ) : null}
          {!desktop ? (
            <button
              type="button"
              className="tavern-close"
              aria-label="Close"
              onClick={() => window.api.panelClose()}
            >
              <WorkspaceIcon name="close" />
            </button>
          ) : null}
        </div>
        {desktop ? (
          <RemixChatHeader
            thread={thread}
            title={currentSessionTitle ?? displayThreadTitle(thread)}
            onRename={onRenameSession}
            onDelete={onDeleteSession}
          >
            <button
              type="button"
              className="remix-context-toggle"
              aria-label={contextRailVisible ? "Hide context" : "Show context"}
              aria-pressed={contextRailVisible}
              title={contextRailVisible ? "Hide context" : "Show context"}
              onClick={toggleContextRail}
            >
              <WorkspaceIcon name="context" />
            </button>
          </RemixChatHeader>
        ) : null}
        <div
          className={`tavern-workspace${
            contextRailVisible ? " is-context-open" : ""
          }`}
        >
          <div className="tavern-workspace-main">
            {!desktop ? (
              <nav
                className="tavern-workspace-mobile-tools"
                aria-label="Workspace"
              >
                {WORKSPACE_TOP_VIEWS.map((view) => (
                  <button
                    key={view}
                    type="button"
                    role="tab"
                    aria-selected={tab === view}
                    onClick={() => setTab(view)}
                  >
                    {view === "history"
                      ? "Conversations"
                      : WORKSPACE_VIEW_LABELS[view]}
                  </button>
                ))}
              </nav>
            ) : null}
            <div
              className="tavern-body tavern-conversation"
              data-remix-view={tab}
              role="tabpanel"
              ref={bodyRef}
            >
              {capabilitiesOpen ? (
                <>
                  <button
                    type="button"
                    className="tavern-file-back"
                    onClick={() => setCapabilitiesOpen(false)}
                  >
                    ← What Freestyle can do
                  </button>
                  <Capabilities
                    onPrompt={(text) => {
                      setCapabilitiesOpen(false);
                      setNotice(null);
                      void sendMessage({ text });
                    }}
                    onOpenApps={() => {
                      setCapabilitiesOpen(false);
                      setNotice("Manage connected apps from Settings.");
                    }}
                  />
                </>
              ) : tab === "history" ? (
                <ThreadHistory
                  currentId={thread.id}
                  onPick={(picked) => {
                    setTab("chat");
                    if (picked.id !== thread.id) {
                      onSelectThread?.(picked);
                    }
                  }}
                />
              ) : isSessionLoading && chatActive ? (
                <ConversationSkeleton />
              ) : sessionLoadError && chatActive ? (
                <div className="tavern-empty" role="status">
                  <p>{sessionLoadError}</p>
                  <button
                    type="button"
                    className="tavern-retry"
                    onClick={onRetrySessionLoad}
                  >
                    Retry
                  </button>
                </div>
              ) : showChat ? (
                <>
                  {messages.map((m) => (
                    <ChatMessage
                      key={m.id}
                      message={m}
                      copied={copiedMessageId === m.id}
                      disabled={pinned}
                      editing={editingMessageId === m.id}
                      editDraft={editDraft}
                      onCopy={() => copyMessage(m)}
                      onEdit={() => startEditingMessage(m)}
                      onEditDraftChange={setEditDraft}
                      onCancelEdit={cancelEditingMessage}
                      onResendEdit={resendEditedMessage}
                      onRegenerate={() => regenerateMessage(m)}
                    />
                  ))}
                  {approvals.map((approval) => (
                    <div
                      key={approval.call.toolCallId}
                      className="tavern-approve"
                    >
                      <span className="tavern-approve-title">
                        {SPRITES_INFO[spriteForm].label.toLowerCase()} wants to
                        act
                      </span>
                      <div className="tavern-approve-text">
                        {describeAgentAction(approval.call)}
                      </div>
                      <div className="tavern-approve-actions">
                        <button
                          type="button"
                          className="tavern-approve-btn tavern-approve-allow"
                          onClick={() => resolveApproval(approval, true)}
                        >
                          Allow
                        </button>
                        <button
                          type="button"
                          className="tavern-approve-btn"
                          onClick={() => resolveApproval(approval, false)}
                        >
                          Don't allow
                        </button>
                      </div>
                    </div>
                  ))}
                  {durableRuntime.data?.pendingAction?.kind === "connector" &&
                  durableRuntime.data.pendingAction.status === "pending" ? (
                    <div className="tavern-approve">
                      <span className="tavern-approve-title">
                        connected app action needs approval
                      </span>
                      <div className="tavern-approve-text">
                        {durableRuntime.data.pendingAction.display}
                      </div>
                      <div className="tavern-approve-actions">
                        <button
                          type="button"
                          className="tavern-approve-btn tavern-approve-allow"
                          onClick={() =>
                            resolveDurableConnector(
                              durableRuntime.data!.pendingAction!,
                              true,
                            )
                          }
                        >
                          Allow
                        </button>
                        <button
                          type="button"
                          className="tavern-approve-btn"
                          onClick={() =>
                            resolveDurableConnector(
                              durableRuntime.data!.pendingAction!,
                              false,
                            )
                          }
                        >
                          Don't allow
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {durableRuntime.data?.pendingAction?.kind === "desktop" &&
                  durableRuntime.data.pendingAction.status === "pending" ? (
                    <div className="tavern-approve">
                      <span className="tavern-approve-title">
                        desktop action waiting
                      </span>
                      <div className="tavern-approve-text">
                        {durableRuntime.data.pendingAction.display}
                      </div>
                      <div className="tavern-approve-actions">
                        <button
                          type="button"
                          className="tavern-approve-btn tavern-approve-allow"
                          onClick={() =>
                            claimDurableDesktopAction(
                              durableRuntime.data!.pendingAction!,
                            )
                          }
                        >
                          Run on this desktop
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {awaitingText ? (
                    <div
                      className="tavern-stream-wait"
                      role="status"
                      aria-label="Thinking"
                    >
                      <Spark state="idle" size={11} />
                    </div>
                  ) : null}
                </>
              ) : chatActive ? (
                <>
                  <AttentionHome
                    onOpenThread={(id, title, updatedAt) =>
                      onSelectThread?.({
                        id,
                        title,
                        updatedAt: Date.parse(updatedAt),
                      })
                    }
                  />
                  <OpenerCards
                    busy={busy}
                    onShowAll={() => setCapabilitiesOpen(true)}
                    onPrompt={(text) => {
                      setNotice(null);
                      void sendMessage({ text });
                    }}
                  />
                </>
              ) : null}
              {notice ? <p className="tavern-notice">{notice}</p> : null}
            </div>

            {chatActive && !capabilitiesOpen ? (
              <div className="tavern-composer">
                <textarea
                  id="panel-composer"
                  className="tavern-input"
                  value={draft}
                  rows={1}
                  placeholder={
                    isSessionLoading
                      ? "Loading conversation…"
                      : "Message Freestyle"
                  }
                  disabled={isSessionLoading || Boolean(sessionLoadError)}
                  onMouseDown={() => window.api.panelRequestFocus()}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (
                      e.key === "Enter" &&
                      !e.shiftKey &&
                      !e.nativeEvent.isComposing
                    ) {
                      e.preventDefault();
                      send();
                    }
                  }}
                />
                <button
                  type="button"
                  className={`tavern-btn tavern-btn-send${action === "stop" ? " is-stop" : ""}`}
                  aria-label={action === "stop" ? "Stop generating" : "Send"}
                  title={action === "stop" ? "Stop generating" : "Send"}
                  disabled={isSessionLoading || Boolean(sessionLoadError)}
                  onClick={action === "stop" ? stopGeneration : send}
                >
                  <WorkspaceIcon name={action === "stop" ? "stop" : "send"} />
                </button>
              </div>
            ) : null}
          </div>
          {desktop ? (
            <RemixContextRail
              attention={contextAttention}
              open={contextRailVisible}
            />
          ) : null}
        </div>
      </div>
      {!desktop ? <PanelTail /> : null}
      {!desktop ? <PanelResizeHandle /> : null}
    </div>
  );
}
