import "../overlay.css";
import "../tavern.css";

import { useChat } from "@ai-sdk/react";
import { ConnectSuggestions } from "@renderer/components/connect-suggestions";
import { ConnectedApps } from "@renderer/components/connected-apps";
import { Markdown } from "@renderer/components/markdown";
import { NotesTab } from "@renderer/components/notes-tab";
import { OnboardingGate, useOnboarding } from "@renderer/components/onboarding";
import { OpenerCards } from "@renderer/components/opener-cards";
import { SettingsView } from "@renderer/components/settings-view";
import { TodosTab } from "@renderer/components/todos-tab";
import {
  type AgentToolCall,
  agentToolTier,
  DECLINED_OUTPUT,
  describeAgentAction,
  executeAgentTool,
} from "@renderer/lib/agent-tools";
import { apiFetch, initApiBase } from "@renderer/lib/api";
import { CloudAuthProvider, useCloudAuth } from "@renderer/lib/auth-context";
import { composerAction } from "@renderer/lib/composer-action";
import { seedMessageFor } from "@renderer/lib/onboarding-core";
import { createQueryClient } from "@renderer/lib/query";
import { installGlobalErrorHandlers } from "@renderer/lib/report-error";
import { useSpriteEmitter } from "@renderer/lib/sprite-emitter";
import { highlightToolJson, toolJson } from "@renderer/lib/tool-json";
import { toolPresentation } from "@renderer/lib/tool-presentation";
import { SpriteBadge } from "@renderer/sprites/badge";
import { type CompanionForm, DEFAULT_COMPANION_FORM } from "@shared/companion";
import { PANEL_TABS, type PanelTab } from "@shared/panel";
import { SPRITES_INFO } from "@shared/sprites";
import { QueryClientProvider } from "@tanstack/react-query";
import {
  DefaultChatTransport,
  lastAssistantMessageIsCompleteWithToolCalls,
  type UIMessage,
} from "ai";
import type React from "react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

const TAB_LABELS: Record<PanelTab, string> = {
  chat: "Chat",
  history: "History",
  todos: "Todos",
  notes: "Notes",
  apps: "Apps",
};

const TAB_PLACEHOLDER: Record<PanelTab, string> = {
  chat: "Ask anything, or point at something on screen.",
  history: "Past conversations land here — pick one to continue it.",
  todos: "Nothing to do yet.",
  notes: "No notes yet.",
  apps: "Connect the apps you live in, and Freestyle can work them for you.",
};

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

function ToolChip({
  partType,
  input,
  output,
}: {
  partType: string;
  input: unknown;
  output: unknown;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const presentation = toolPresentation(partType);
  const hasInput =
    input !== undefined &&
    input !== null &&
    (typeof input !== "object" || Object.keys(input).length > 0);
  const hasOutput =
    output !== undefined &&
    output !== null &&
    (typeof output !== "object" ||
      Object.keys(output).some((key) => key !== "ok"));
  const canExpand = hasInput || hasOutput;
  const activity = (
    <>
      <span className="tavern-tool-mark" aria-hidden="true">
        ◆
      </span>
      <span className="tavern-tool-copy">
        <strong>{presentation.title}</strong>
        {presentation.detail ? <small>{presentation.detail}</small> : null}
      </span>
      <span className="tavern-tool-state">
        <i aria-hidden="true" /> Done
      </span>
      {canExpand ? (
        <span className="tavern-tool-caret" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
      ) : null}
    </>
  );

  if (!canExpand) {
    return <div className="tavern-tool tavern-tool-static">{activity}</div>;
  }

  return (
    <div className="tavern-tool">
      <button
        type="button"
        className="tavern-tool-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {activity}
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
          ) : null}
        </div>
      ) : null}
    </div>
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
        <span aria-hidden="true">{copied ? "✓" : "⧉"}</span>
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
          <span aria-hidden="true">✎</span>
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
          <span aria-hidden="true">↻</span>
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
            if (!part.text || isPlaceholderText(part.text)) return null;
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
          if (part.type.startsWith("tool-")) {
            const tool = part as {
              state?: string;
              input?: unknown;
              output?: { ok?: boolean; reason?: string };
            };
            if (tool.state !== "output-available") return null;
            if (tool.output?.ok === false) return null;
            return (
              <ToolChip
                key={`${message.id}-${i}`}
                partType={part.type}
                input={tool.input}
                output={tool.output}
              />
            );
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

interface ThreadState {
  id: string;
  messages: UIMessage[];
}

interface ThreadSummary {
  id: string;
  title: string;
  updatedAt: number;
}

function dateGroup(ts: number): string {
  const day = (d: Date): number =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const date = new Date(ts);
  const now = new Date();
  const diffDays = Math.round((day(now) - day(date)) / 86_400_000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  const opts: Intl.DateTimeFormatOptions =
    date.getFullYear() === now.getFullYear()
      ? { month: "long", day: "numeric" }
      : { month: "long", day: "numeric", year: "numeric" };
  return date.toLocaleDateString(undefined, opts);
}

function newThread(): ThreadState {
  return { id: crypto.randomUUID(), messages: [] };
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
        ×
      </button>
      <div className="tavern-gate-body">
        <div className="tavern-gate-lockup">
          <span className="tavern-gate-spark" />
          <span className="tavern-gate-wordmark">
            freestyle<span className="tavern-gate-accent">.</span>
          </span>
        </div>
        <h1 className="tavern-gate-heading">
          welcome <span className="tavern-gate-accent">back.</span>
        </h1>
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

function PanelRoot(): React.JSX.Element {
  const [thread, setThread] = useState<ThreadState | null>(null);

  useEffect(() => {
    const off = window.api.onPanelOpenThread((threadId) => {
      void apiFetch(`/api/agent/thread/${threadId}`)
        .then(async (res) => {
          if (!res.ok) return null;
          const data = (await res.json()) as {
            thread: { id: string; messages: UIMessage[] } | null;
          };
          return data.thread;
        })
        .catch(() => null)
        .then((picked) => {
          if (picked) setThread({ id: picked.id, messages: picked.messages });
        });
    });
    return () => off?.();
  }, []);

  useEffect(() => {
    void apiFetch("/api/agent/thread/latest")
      .then(async (res) => {
        if (!res.ok) return null;
        const data = (await res.json()) as {
          thread: { id: string; messages: UIMessage[] } | null;
        };
        return data.thread;
      })
      .catch(() => null)
      .then((latest) =>
        setThread(
          latest ? { id: latest.id, messages: latest.messages } : newThread(),
        ),
      );
  }, []);

  if (!thread) return <div className="tavern tavern-panel" />;
  return (
    <PanelInner key={thread.id} thread={thread} onSwitchThread={setThread} />
  );
}

function ThreadHistory({
  onPick,
  currentId,
}: {
  onPick: (thread: ThreadState) => void;
  currentId: string;
}): React.JSX.Element {
  const [threads, setThreads] = useState<ThreadSummary[]>([]);

  useEffect(() => {
    void apiFetch("/api/agent/thread/list")
      .then(async (res) =>
        res.ok
          ? ((await res.json()) as { threads: ThreadSummary[] }).threads
          : [],
      )
      .catch(() => [])
      .then(setThreads);
  }, []);

  if (threads.length === 0)
    return <div className="tavern-empty">No conversations yet.</div>;

  let lastGroup = "";
  return (
    <>
      {threads.map((t) => {
        const group = dateGroup(t.updatedAt);
        const divider = group !== lastGroup;
        lastGroup = group;
        return (
          <Fragment key={t.id}>
            {divider ? <p className="tavern-thread-divider">{group}</p> : null}
            <button
              type="button"
              className={`tavern-thread-row${t.id === currentId ? " is-current" : ""}`}
              onClick={() => {
                void apiFetch(`/api/agent/thread/${t.id}`).then(async (res) => {
                  if (!res.ok) return;
                  const data = (await res.json()) as {
                    thread: { id: string; messages: UIMessage[] };
                  };
                  onPick({
                    id: data.thread.id,
                    messages: data.thread.messages,
                  });
                });
              }}
            >
              {t.title}
            </button>
          </Fragment>
        );
      })}
    </>
  );
}

function PanelInner({
  thread,
  onSwitchThread,
}: {
  thread: ThreadState;
  onSwitchThread: (thread: ThreadState) => void;
}): React.JSX.Element {
  const [tab, setTab] = useState<PanelTab>("chat");
  const auth = useCloudAuth();
  const onboarding = useOnboarding(!!auth.user);
  const [spriteForm, setSpriteForm] = useState<CompanionForm>(
    DEFAULT_COMPANION_FORM,
  );

  useEffect(() => {
    void window.api
      .companionForm()
      .then(setSpriteForm)
      .catch(() => {});
    const offForm = window.api.onCompanionForm(setSpriteForm);
    return () => offForm?.();
  }, []);
  const [draft, setDraft] = useState("");

  const [notice, setNotice] = useState<string | null>(null);
  const [approvals, setApprovals] = useState<AgentToolCall[]>([]);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const dictationBaseRef = useRef<string | null>(null);

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

  const { messages, sendMessage, regenerate, stop, status, addToolOutput } =
    useChat({
      id: thread.id,
      messages: thread.messages,
      transport,
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
      onFinish: ({ messages: finished }) => {
        if (finished.length === 0) return;
        const last = finished[finished.length - 1];
        if (last?.role !== "assistant") return;
        const text = messageText(last);
        if (!text) return;
        window.api.agentTurnFinished({
          threadId: thread.id,
          excerpt: text.slice(0, 140),
        });
      },
      onToolCall: async ({ toolCall }) => {
        const call: AgentToolCall = {
          toolName: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          input: toolCall.input,
        };
        const tier = await agentToolTier(call);
        if (tier === "confirmed") {
          setApprovals((prev) => [...prev, call]);
          return;
        }
        const output =
          tier === "free"
            ? await executeAgentTool(call, thread.id)
            : { ok: false, reason: `unknown tool: ${call.toolName}` };
        addToolOutput({
          tool: toolCall.toolName,
          toolCallId: toolCall.toolCallId,
          output,
        });
      },
      onError: (err) => {
        setNotice(
          err.message.includes("cloud_auth_required") ||
            err.message.includes("401")
            ? "Sign in to Freestyle Cloud to chat."
            : err.message,
        );
      },
    });

  const busy = status === "submitted" || status === "streaming";
  const action = composerAction(status);

  useSpriteEmitter(messages, approvals.length, busy);

  const send = (): void => {
    const text = draft.trim();
    if (!text || tab !== "chat" || busy || approvals.length > 0) return;
    setNotice(null);
    setDraft("");
    void sendMessage({ text });
  };

  const stopGeneration = (): void => {
    if (!busy) return;
    stop();
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

  const resolveApproval = (call: AgentToolCall, allowed: boolean): void => {
    setApprovals((prev) =>
      prev.filter((a) => a.toolCallId !== call.toolCallId),
    );
    void (async () => {
      const output = allowed
        ? await executeAgentTool(call, thread.id)
        : DECLINED_OUTPUT;
      addToolOutput({
        tool: call.toolName,
        toolCallId: call.toolCallId,
        output,
      });
    })();
  };

  useEffect(() => {
    const el = bodyRef.current;
    if (el && (messages.length > 0 || approvals.length > 0))
      el.scrollTop = el.scrollHeight;
  }, [messages, approvals]);

  const pinned = busy || approvals.length > 0;
  useEffect(() => {
    window.api.panelSetBusy(pinned);
    return () => window.api.panelSetBusy(false);
  }, [pinned]);

  useEffect(() => {
    // The composer only exists on the chat tab — dictation and explicit
    // focus requests must surface it first.
    const showComposer = (): void => {
      setSettingsOpen(false);
      setTab("chat");
    };
    const offFocus = window.api.onPanelFocusComposer(() => {
      showComposer();
      requestAnimationFrame(() =>
        document.getElementById("panel-composer")?.focus(),
      );
    });
    const offShowSettings = window.api.onPanelShowSettings(() => {
      setSettingsOpen(true);
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
    return () => {
      offFocus?.();
      offShowSettings?.();
      offDictation?.();
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") window.api.panelClose();
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
  }, []);

  const chatActive = tab === "chat";
  const showChat = chatActive && messages.length > 0;

  // Signed out, the gate is the entire panel — no head, no tabs, no way to
  // reach the agent. While auth status resolves, show nothing rather than
  // flashing the gate at signed-in users.
  if (!auth.user) {
    return (
      <div className="tavern-shell">
        <div className="tavern tavern-panel">
          {auth.loading ? null : <SignInGate />}
        </div>
        <PanelTail />
      </div>
    );
  }

  // First meeting: Jeb runs his intro as a takeover, same contract as the
  // sign-in gate. While the flag loads, show nothing rather than flashing
  // the intro at users who've already been through it.
  if (onboarding.status !== "done") {
    return (
      <div className="tavern-shell">
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
        <PanelTail />
      </div>
    );
  }

  return (
    <div className="tavern-shell">
      <div className="tavern tavern-panel">
        <div className="tavern-head">
          <SpriteBadge form={spriteForm} working={busy} size={22} />
          <span className="tavern-head-name">
            freestyle<i>.</i>
          </span>
          <span className="tavern-head-spacer" />
          <button
            type="button"
            className="tavern-head-new"
            title="New conversation"
            disabled={pinned}
            onClick={() => onSwitchThread(newThread())}
          >
            ＋ New
          </button>
          <button
            type="button"
            className="tavern-close"
            aria-label="Close"
            onClick={() => window.api.panelClose()}
          >
            ×
          </button>
        </div>

        <div className="tavern-tabs" role="tablist">
          {PANEL_TABS.map((id) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={!settingsOpen && tab === id}
              className="tavern-tab"
              onClick={() => {
                setSettingsOpen(false);
                setTab(id);
              }}
            >
              {TAB_LABELS[id]}
            </button>
          ))}
          <span className="tavern-head-spacer" />
          <button
            type="button"
            role="tab"
            aria-selected={settingsOpen}
            aria-label="Settings"
            title="Settings"
            className="tavern-tab tavern-tab-gear"
            onClick={() => setSettingsOpen((v) => !v)}
          >
            ⚙
          </button>
        </div>

        <div className="tavern-body" role="tabpanel" ref={bodyRef}>
          {settingsOpen ? (
            <SettingsView
              onClose={() => setSettingsOpen(false)}
              onThreadsCleared={() => onSwitchThread(newThread())}
              onReplayIntro={() => {
                setSettingsOpen(false);
                onboarding.replay();
              }}
            />
          ) : tab === "history" ? (
            <ThreadHistory
              currentId={thread.id}
              onPick={(picked) => {
                if (picked.id === thread.id) setTab("chat");
                else onSwitchThread(picked);
              }}
            />
          ) : tab === "apps" ? (
            <ConnectedApps
              onUseWorkflow={(prompt) => {
                setTab("chat");
                setNotice(null);
                void sendMessage({ text: prompt });
              }}
            />
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
              {approvals.map((call) => (
                <div key={call.toolCallId} className="tavern-approve">
                  <span className="tavern-approve-title">
                    {SPRITES_INFO[spriteForm].label.toLowerCase()} wants to act
                  </span>
                  <div className="tavern-approve-text">
                    {describeAgentAction(call)}
                  </div>
                  <div className="tavern-approve-actions">
                    <button
                      type="button"
                      className="tavern-approve-btn tavern-approve-allow"
                      onClick={() => resolveApproval(call, true)}
                    >
                      Allow
                    </button>
                    <button
                      type="button"
                      className="tavern-approve-btn"
                      onClick={() => resolveApproval(call, false)}
                    >
                      Don't allow
                    </button>
                  </div>
                </div>
              ))}
              {status === "submitted" ? (
                <div className="tavern-thinking">…</div>
              ) : null}
            </>
          ) : tab === "todos" ? (
            <TodosTab mascot={SPRITES_INFO[spriteForm].label} />
          ) : tab === "notes" ? (
            <NotesTab />
          ) : chatActive ? (
            <OpenerCards
              busy={busy}
              onPrompt={(text) => {
                setNotice(null);
                void sendMessage({ text });
              }}
            />
          ) : (
            <div className="tavern-empty">{TAB_PLACEHOLDER[tab]}</div>
          )}
          {notice ? <p className="tavern-notice">{notice}</p> : null}
        </div>

        {chatActive && !settingsOpen ? (
          <div className="tavern-composer">
            <textarea
              id="panel-composer"
              className="tavern-input"
              value={draft}
              rows={1}
              placeholder="Ask anything"
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
              onClick={action === "stop" ? stopGeneration : send}
            >
              {action === "stop" ? "■" : "↑"}
            </button>
          </div>
        ) : null}
      </div>
      <PanelTail />
    </div>
  );
}

initApiBase();
installGlobalErrorHandlers();

const queryClient = createQueryClient();

const container = document.getElementById("root");
if (container)
  createRoot(container).render(
    <QueryClientProvider client={queryClient}>
      <CloudAuthProvider>
        <PanelRoot />
      </CloudAuthProvider>
    </QueryClientProvider>,
  );
