import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { del, getJson, putJson } from "../shared/api";
import {
  type AgentConfig,
  DEFAULT_TOOL_GROUPS,
  type SavedConversation,
} from "../shared/types";
import { ConversationViewer } from "./conversation-viewer";
import { SettingsForm } from "./settings-form";

const EMPTY: AgentConfig = {
  systemPrompt: "",
  agentName: "Freestyle",
  mcpServers: [],
  skills: [],
  builtinToolsEnabled: true,
  builtinToolGroups: { ...DEFAULT_TOOL_GROUPS },
  computerUseMode: "guided",
};

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

function RefreshIcon(): React.JSX.Element {
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
      <path d="M1.5 7a5.5 5.5 0 0 1 9.9-3.3M12.5 7a5.5 5.5 0 0 1-9.9 3.3" />
      <path d="M11.5 1.5v2.5H9M2.5 12.5V10H5" />
    </svg>
  );
}

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

/* ---- Query keys ---- */

const configKey = ["agent-config"] as const;
const historyKey = ["agent-conversations"] as const;

type View = "conversations" | "settings";

export function SettingsPage(): React.JSX.Element {
  const queryClient = useQueryClient();
  const [view, setView] = useState<View>("conversations");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // ---- Config query ----

  const { data: config } = useQuery({
    queryKey: configKey,
    queryFn: async () => (await getJson<AgentConfig>("/config")) ?? EMPTY,
  });

  // ---- Conversations query ----

  const { data: conversations = [], refetch: refetchHistory } = useQuery({
    queryKey: historyKey,
    queryFn: async () => {
      const data = await getJson<{ conversations: SavedConversation[] }>(
        "/conversations",
      );
      return data?.conversations ?? [];
    },
  });

  // ---- Delete single conversation ----

  const deleteConversation = useMutation({
    mutationFn: (id: string) => del(`/conversations/${id}`),
    onSuccess: (_data, id) => {
      queryClient.setQueryData<SavedConversation[]>(historyKey, (prev) =>
        prev?.filter((c) => c.id !== id),
      );
      if (selectedId === id) setSelectedId(null);
    },
  });

  // ---- Clear all conversations ----

  const clearAll = useMutation({
    mutationFn: () => del("/conversations"),
    onSuccess: () => {
      queryClient.setQueryData<SavedConversation[]>(historyKey, []);
      setSelectedId(null);
    },
  });

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  if (!config) {
    return (
      <main className="page">
        <p className="muted">Loading...</p>
      </main>
    );
  }

  // ---- Settings view ----

  if (view === "settings") {
    return (
      <main className="page">
        <SettingsForm
          config={config}
          onSave={(updated) => {
            queryClient.setQueryData<AgentConfig>(configKey, updated);
            setView("conversations");
          }}
          onBack={() => setView("conversations")}
        />
      </main>
    );
  }

  // ---- Conversations view ----

  return (
    <main className="page">
      <header className="head">
        <div className="head-left">
          <h1 className="page-title">
            <span className="title-accent">Voice Agent</span>
          </h1>
          <p className="page-lede">
            Say "<strong>{config.agentName}</strong>" to start a conversation.
          </p>
        </div>
        <button
          type="button"
          className="settings-btn"
          onClick={() => setView("settings")}
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
            <div style={{ display: "flex", gap: 4 }}>
              <button
                type="button"
                className="icon-btn"
                onClick={() => void refetchHistory()}
                aria-label="Refresh"
                title="Refresh"
              >
                <RefreshIcon />
              </button>
              {conversations.length > 0 && (
                <button
                  type="button"
                  className="icon-btn destructive"
                  onClick={() => clearAll.mutate()}
                  aria-label="Clear all conversations"
                  title="Clear all"
                >
                  <TrashIcon />
                </button>
              )}
            </div>
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
            onDelete={() => deleteConversation.mutate(selected.id)}
          />
        )}
      </div>
    </main>
  );
}
