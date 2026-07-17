import { useCallback, useEffect, useRef } from "react";
import type { AgentConfig } from "../shared/types";
import { McpSection } from "./mcp-section";
import { SkillsSection } from "./skills-section";

interface Props {
  config: AgentConfig;
  onUpdate: (patch: Partial<AgentConfig>) => void;
  onClose: () => void;
}

export function SettingsDialog({
  config,
  onUpdate,
  onClose,
}: Props): React.JSX.Element {
  const backdropRef = useRef<HTMLDivElement>(null);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === backdropRef.current) onClose();
    },
    [onClose],
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="dialog-backdrop"
      ref={backdropRef}
      onClick={handleBackdropClick}
    >
      <div className="dialog" role="dialog" aria-label="Agent settings">
        <div className="dialog-header">
          <h2 className="dialog-title">Agent Settings</h2>
          <button
            type="button"
            className="dialog-close"
            onClick={onClose}
            aria-label="Close"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 14 14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            >
              <path d="M3.5 3.5l7 7M10.5 3.5l-7 7" />
            </svg>
          </button>
        </div>

        <div className="dialog-body">
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
                onChange={(e) => onUpdate({ agentName: e.target.value })}
                placeholder="Freestyle"
              />
              <span className="hint">
                Say this at the start of a dictation to talk to the agent.
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
                onChange={(e) => onUpdate({ systemPrompt: e.target.value })}
              />
              <span className="hint">
                The agent's base behavior. Enabled skills are appended
                automatically.
              </span>
            </div>
          </section>

          <McpSection
            servers={config.mcpServers}
            onChange={(mcpServers) => onUpdate({ mcpServers })}
          />

          <SkillsSection
            skills={config.skills}
            onChange={(skills) => onUpdate({ skills })}
          />
        </div>
      </div>
    </div>
  );
}
