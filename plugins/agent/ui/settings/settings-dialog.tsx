import { useCallback, useEffect, useRef } from "react";
import type { AgentConfig, McpServerConfig, Skill } from "../shared/types";

interface Props {
  config: AgentConfig;
  onUpdate: (patch: Partial<AgentConfig>) => void;
  onClose: () => void;
}

function uid(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
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

  const updateServer = (id: string, patch: Partial<McpServerConfig>) =>
    onUpdate({
      mcpServers: config.mcpServers.map((s) =>
        s.id === id ? { ...s, ...patch } : s,
      ),
    });

  const addServer = () =>
    onUpdate({
      mcpServers: [
        ...config.mcpServers,
        {
          id: uid(),
          name: "New server",
          transport: "stdio",
          command: "",
          args: [],
          enabled: false,
        },
      ],
    });

  const removeServer = (id: string) =>
    onUpdate({ mcpServers: config.mcpServers.filter((s) => s.id !== id) });

  const updateSkill = (id: string, patch: Partial<Skill>) =>
    onUpdate({
      skills: config.skills.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    });

  const addSkill = () =>
    onUpdate({
      skills: [
        ...config.skills,
        { id: uid(), name: "New skill", instructions: "", enabled: true },
      ],
    });

  const removeSkill = (id: string) =>
    onUpdate({ skills: config.skills.filter((s) => s.id !== id) });

  return (
    <div
      className="dialog-backdrop"
      ref={backdropRef}
      onClick={handleBackdropClick}
    >
      <div className="dialog" role="dialog" aria-label="Agent settings">
        <div className="dialog-header">
          <h2 className="dialog-title">Settings</h2>
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
          {/* Identity */}
          <div className="dlg-section">
            <div className="dlg-section-head">
              <span className="eyebrow">Identity</span>
            </div>
            <div className="dlg-row">
              <label className="dlg-label" htmlFor="agent-name">
                Agent name
              </label>
              <input
                id="agent-name"
                className="input"
                value={config.agentName}
                onChange={(e) => onUpdate({ agentName: e.target.value })}
                placeholder="Freestyle"
              />
            </div>
            <span className="hint">The name spoken to summon the agent.</span>
          </div>

          {/* Instructions */}
          <div className="dlg-section">
            <div className="dlg-section-head">
              <span className="eyebrow">Instructions</span>
            </div>
            <textarea
              className="textarea"
              value={config.systemPrompt}
              onChange={(e) => onUpdate({ systemPrompt: e.target.value })}
              placeholder="You are a helpful voice assistant..."
            />
            <span className="hint">
              Base behavior. Enabled skills are appended automatically.
            </span>
          </div>

          {/* Built-in tools */}
          <div className="dlg-section">
            <div className="dlg-section-head">
              <span className="eyebrow">Built-in Tools</span>
            </div>
            <div className="dlg-item builtin-tools-item">
              <div className="dlg-item-head">
                <div className="builtin-tools-label">
                  <span className="builtin-tools-name">Freestyle Tools</span>
                  <span className="badge badge-builtin">Built-in</span>
                </div>
                <label className="toggle">
                  <input
                    type="checkbox"
                    checked={config.builtinToolsEnabled}
                    onChange={(e) =>
                      onUpdate({ builtinToolsEnabled: e.target.checked })
                    }
                  />
                  On
                </label>
              </div>
              <span className="hint" style={{ marginTop: 4 }}>
                File system, shell, clipboard, screenshots, shortcuts, webhooks,
                and more.
              </span>
            </div>
          </div>

          {/* MCP servers */}
          <div className="dlg-section">
            <div className="dlg-section-head">
              <span className="eyebrow">MCP Servers</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={addServer}
              >
                + Add
              </button>
            </div>

            {config.mcpServers.length === 0 && (
              <p className="item-empty">No servers connected.</p>
            )}

            {config.mcpServers.map((s) => (
              <div key={s.id} className="dlg-item">
                <div className="dlg-item-head">
                  <input
                    className="input input-compact"
                    value={s.name}
                    onChange={(e) =>
                      updateServer(s.id, { name: e.target.value })
                    }
                    placeholder="Server name"
                    aria-label="Server name"
                    readOnly={s.builtin}
                  />
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={s.enabled}
                      onChange={(e) =>
                        updateServer(s.id, { enabled: e.target.checked })
                      }
                    />
                    On
                  </label>
                  {!s.builtin && (
                    <button
                      type="button"
                      className="icon-btn destructive"
                      onClick={() => removeServer(s.id)}
                      title="Remove"
                      aria-label="Remove server"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {!s.builtin && (
                  <div className="dlg-item-fields">
                    <div className="dlg-row">
                      <label className="dlg-label-sm">Transport</label>
                      <select
                        className="select select-compact"
                        value={s.transport}
                        onChange={(e) =>
                          updateServer(s.id, {
                            transport: e.target.value as "stdio" | "http",
                          })
                        }
                      >
                        <option value="stdio">stdio</option>
                        <option value="http">http</option>
                      </select>
                    </div>

                    {s.transport === "stdio" ? (
                      <>
                        <div className="dlg-row">
                          <label className="dlg-label-sm">Command</label>
                          <input
                            className="input input-compact"
                            value={s.command ?? ""}
                            onChange={(e) =>
                              updateServer(s.id, { command: e.target.value })
                            }
                            placeholder="npx"
                          />
                        </div>
                        <div className="dlg-row">
                          <label className="dlg-label-sm">Args</label>
                          <textarea
                            className="textarea textarea-compact mono"
                            value={(s.args ?? []).join("\n")}
                            onChange={(e) =>
                              updateServer(s.id, {
                                args: e.target.value
                                  .split("\n")
                                  .map((a) => a.trim())
                                  .filter(Boolean),
                              })
                            }
                            placeholder="-y&#10;@modelcontextprotocol/server-filesystem"
                          />
                        </div>
                      </>
                    ) : (
                      <div className="dlg-row">
                        <label className="dlg-label-sm">URL</label>
                        <input
                          className="input input-compact"
                          value={s.url ?? ""}
                          onChange={(e) =>
                            updateServer(s.id, { url: e.target.value })
                          }
                          placeholder="https://example.com/mcp"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Skills */}
          <div className="dlg-section">
            <div className="dlg-section-head">
              <span className="eyebrow">Skills</span>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={addSkill}
              >
                + Add
              </button>
            </div>

            {config.skills.length === 0 && (
              <p className="item-empty">No skills defined.</p>
            )}

            {config.skills.map((s) => (
              <div key={s.id} className="dlg-item">
                <div className="dlg-item-head">
                  <input
                    className="input input-compact"
                    value={s.name}
                    onChange={(e) =>
                      updateSkill(s.id, { name: e.target.value })
                    }
                    placeholder="Skill name"
                    aria-label="Skill name"
                  />
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={s.enabled}
                      onChange={(e) =>
                        updateSkill(s.id, { enabled: e.target.checked })
                      }
                    />
                    On
                  </label>
                  <button
                    type="button"
                    className="icon-btn destructive"
                    onClick={() => removeSkill(s.id)}
                    title="Remove"
                    aria-label="Remove skill"
                  >
                    ✕
                  </button>
                </div>
                <textarea
                  className="textarea textarea-compact"
                  value={s.instructions}
                  onChange={(e) =>
                    updateSkill(s.id, { instructions: e.target.value })
                  }
                  placeholder="Instructions for this skill..."
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
