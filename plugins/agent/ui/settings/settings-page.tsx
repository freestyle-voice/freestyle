import { useCallback, useEffect, useRef, useState } from "react";
import { getJson, putJson } from "../shared/api";
import type { AgentConfig } from "../shared/types";
import { ConversationCard } from "./conversation-card";
import { McpSection } from "./mcp-section";
import { SkillsSection } from "./skills-section";

const EMPTY: AgentConfig = {
  systemPrompt: "",
  agentName: "Freestyle",
  mcpServers: [],
  skills: [],
};

/** Debounce delay for auto-save after the last edit. */
const SAVE_DEBOUNCE_MS = 500;

export function SettingsPage(): React.JSX.Element {
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void getJson<AgentConfig>("/config").then((c) => setConfig(c ?? EMPTY));
  }, []);

  // Auto-save: persist edits after a short debounce so there's no Save button.
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

  if (!config) {
    return (
      <main className="page">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  return (
    <main className="page">
      <header className="head">
        <h1 className="page-title">
          <span className="title-accent">Voice Agent</span>
        </h1>
        <p className="page-lede">
          Talk to an AI agent by voice. Say its name to open a chat panel on the
          pill — give it tools with MCP servers and shape it with skills.
        </p>
      </header>

      <section className="card">
        <div className="card-head">
          <div>
            <div className="eyebrow">Identity</div>
            <h2>Name</h2>
          </div>
        </div>
        <div className="field">
          <span className="label">Agent name</span>
          <input
            className="input"
            value={config.agentName}
            onChange={(e) => update({ agentName: e.target.value })}
            placeholder="Freestyle"
          />
          <span className="hint">
            Say this at the start of a dictation — “
            {config.agentName || "Freestyle"}, what's the weather?” — to talk to
            the agent instead of typing. A leading “hey” / “ok” is always
            optional, and the agent knows itself by this name.
          </span>
        </div>
      </section>

      <section className="card">
        <div className="card-head">
          <div>
            <div className="eyebrow">Persona</div>
            <h2>Instructions</h2>
          </div>
        </div>
        <div className="field">
          <span className="label">System prompt</span>
          <textarea
            className="textarea"
            value={config.systemPrompt}
            onChange={(e) => update({ systemPrompt: e.target.value })}
          />
          <span className="hint">
            The agent's base behavior. Enabled skills are appended
            automatically.
          </span>
        </div>
      </section>

      <McpSection
        servers={config.mcpServers}
        onChange={(mcpServers) => update({ mcpServers })}
      />

      <SkillsSection
        skills={config.skills}
        onChange={(skills) => update({ skills })}
      />

      <ConversationCard />
    </main>
  );
}
