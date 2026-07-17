import { useCallback, useEffect, useRef, useState } from "react";
import { del, getJson, putJson } from "../shared/api";
import type { AgentConfig, SavedConversation } from "../shared/types";
import { ConversationViewer } from "./conversation-viewer";
import { McpSection } from "./mcp-section";
import { SettingsDialog } from "./settings-dialog";
import { SkillsSection } from "./skills-section";

const EMPTY: AgentConfig = {
  systemPrompt: "",
  agentName: "Freestyle",
  mcpServers: [],
  skills: [],
};

const SAVE_DEBOUNCE_MS = 500;

function GearIcon(): React.JSX.Element {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 18 18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M9 11.25a2.25 2.25 0 1 0 0-4.5 2.25 2.25 0 0 0 0 4.5Z" />
      <path d="M14.7 11.25a1.24 1.24 0 0 0 .25 1.37l.04.04a1.5 1.5 0 1 1-2.12 2.12l-.05-.04a1.24 1.24 0 0 0-1.37-.25 1.24 1.24 0 0 0-.75 1.14v.12a1.5 1.5 0 0 1-3 0v-.07a1.24 1.24 0 0 0-.82-1.14 1.24 1.24 0 0 0-1.37.25l-.04.04a1.5 1.5 0 1 1-2.12-2.12l.04-.05a1.24 1.24 0 0 0 .25-1.37 1.24 1.24 0 0 0-1.14-.75h-.12a1.5 1.5 0 0 1 0-3h.07a1.24 1.24 0 0 0 1.14-.82 1.24 1.24 0 0 0-.25-1.37l-.04-.04a1.5 1.5 0 1 1 2.12-2.12l.05.04a1.24 1.24 0 0 0 1.37.25h.06a1.24 1.24 0 0 0 .75-1.14v-.12a1.5 1.5 0 0 1 3 0v.07a1.24 1.24 0 0 0 .75 1.14 1.24 1.24 0 0 0 1.37-.25l.04-.04a1.5 1.5 0 1 1 2.12 2.12l-.04.05a1.24 1.24 0 0 0-.25 1.37v.06a1.24 1.24 0 0 0 1.14.75h.12a1.5 1.5 0 0 1 0 3h-.07a1.24 1.24 0 0 0-1.14.75Z" />
    </svg>
  );
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function SettingsPage(): React.JSX.Element {
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [conversations, setConversations] = useState<SavedConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshHistory = useCallback(async () => {
    const data = await getJson<{ conversations: SavedConversation[] }>(
      "/conversations",
    );
    if (data?.conversations) setConversations(data.conversations);
  }, []);

  useEffect(() => {
    void getJson<AgentConfig>("/config").then((c) => setConfig(c ?? EMPTY));
    void refreshHistory();
    const id = setInterval(refreshHistory, 5000);
    return () => clearInterval(id);
  }, [refreshHistory]);

  const persist = useCallback((next: AgentConfig) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void putJson<AgentConfig>("/config", next);
    }, SAVE_DEBOUNCE_MS);
  }, []);

  const update = useCallback(
    (patch: Partial<AgentConfig>) => {
      setConfig((prev) => {
        if (!prev) return prev;
        const next = { ...prev, ...patch };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const deleteConversation = useCallback(
    async (id: string) => {
      await del(`/conversations/${id}`);
      setConversations((prev) => prev.filter((c) => c.id !== id));
      if (selectedId === id) setSelectedId(null);
    },
    [selectedId],
  );

  const clearAll = useCallback(async () => {
    await del("/conversations");
    setConversations([]);
    setSelectedId(null);
  }, []);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  if (!config) {
    return (
      <main className="page">
        <p className="muted">Loading...</p>
      </main>
    );
  }

  return (
    <main className="page">
      <header className="head">
        <div className="head-left">
          <h1 className="page-title">
            <span className="title-accent">Voice Agent</span>
          </h1>
          <p className="page-lede">
            Talk to an AI agent by voice. Say its name to start a conversation.
          </p>
        </div>
        <button
          type="button"
          className="settings-btn"
          onClick={() => setSettingsOpen(true)}
          aria-label="Agent settings"
          title="Settings"
        >
          <GearIcon />
        </button>
      </header>

      <div className={`split-view${selected ? " has-detail" : ""}`}>
        {/* Card grid — conversation history */}
        <div className="card-grid-pane">
          <div className="card-grid-header">
            <span className="eyebrow">Conversations</span>
            {conversations.length > 0 && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={clearAll}
              >
                Clear all
              </button>
            )}
          </div>

          {conversations.length === 0 ? (
            <div className="empty-state">
              <p className="empty-title-text">No conversations yet</p>
              <p className="empty-hint">
                Say "{config.agentName}" to start a conversation. Past
                conversations will appear here.
              </p>
            </div>
          ) : (
            <div className="card-grid">
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  type="button"
                  className={`conv-card${selectedId === conv.id ? " active" : ""}`}
                  onClick={() => setSelectedId(conv.id)}
                >
                  <span className="conv-card-title">{conv.title}</span>
                  <span className="conv-card-meta">
                    <span>{conv.messages.length} messages</span>
                    <span>{formatDate(conv.createdAt)}</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Detail pane — conversation viewer */}
        {selected && (
          <ConversationViewer
            conversation={selected}
            onClose={() => setSelectedId(null)}
            onDelete={() => deleteConversation(selected.id)}
          />
        )}
      </div>

      {settingsOpen && config && (
        <SettingsDialog
          config={config}
          onUpdate={update}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </main>
  );
}
