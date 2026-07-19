import { useCallback, useEffect, useRef, useState } from "react";
import { del, getJson, postJson } from "../shared/api";
import {
  type AgentConfig,
  type McpAuthMode,
  type McpServerConfig,
  type Skill,
  TOOL_GROUPS,
  uid,
} from "../shared/types";

/* ---- OAuth status component ---- */

function OAuthStatus({ serverId }: { serverId: string }): React.JSX.Element {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkStatus = useCallback(async () => {
    const data = await getJson<{ authorized: boolean }>(
      `/oauth/status?server_id=${encodeURIComponent(serverId)}`,
    );
    if (data) {
      setAuthorized(data.authorized);
      if (data.authorized && pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
        setBusy(false);
      }
    }
  }, [serverId]);

  useEffect(() => {
    void checkStatus();
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [checkStatus]);

  const handleAuthorize = async () => {
    setBusy(true);
    await postJson(`/oauth/connect?server_id=${encodeURIComponent(serverId)}`);
    pollRef.current = setInterval(() => void checkStatus(), 2000);
    setTimeout(() => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
        setBusy(false);
      }
    }, 120_000);
  };

  const handleRevoke = async () => {
    await del(`/oauth/revoke?server_id=${encodeURIComponent(serverId)}`);
    setAuthorized(false);
  };

  return (
    <div className="oauth-status">
      <span className={`oauth-dot ${authorized ? "oauth-ok" : "oauth-none"}`} />
      <span className="oauth-label">
        {authorized === null
          ? "Checking..."
          : authorized
            ? "Authorized"
            : "Not authorized"}
      </span>
      {authorized ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm oauth-btn"
          onClick={() => void handleRevoke()}
        >
          Revoke
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-ghost btn-sm oauth-btn"
          onClick={() => void handleAuthorize()}
          disabled={busy}
        >
          {busy ? "Waiting..." : "Authorize"}
        </button>
      )}
    </div>
  );
}

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

  // ---- inline HeadersEditor ----
  function HeadersEditor({
    headers,
    onChange,
  }: {
    headers: Record<string, string>;
    onChange: (h: Record<string, string>) => void;
  }): React.JSX.Element {
    const entries = Object.entries(headers);

    const setEntry = (oldKey: string, newKey: string, value: string): void => {
      const next = { ...headers };
      if (oldKey !== newKey) delete next[oldKey];
      next[newKey] = value;
      onChange(next);
    };

    const removeEntry = (key: string): void => {
      const next = { ...headers };
      delete next[key];
      onChange(next);
    };

    const addEntry = (): void => {
      let i = 1;
      let key = `Header-${i}`;
      while (key in headers) {
        i++;
        key = `Header-${i}`;
      }
      onChange({ ...headers, [key]: "" });
    };

    return (
      <div className="headers-editor">
        <div className="headers-editor-head">
          <label className="dlg-label-sm">Headers</label>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={addEntry}
          >
            + Add
          </button>
        </div>
        {entries.length === 0 && (
          <span className="hint">No custom headers.</span>
        )}
        {entries.map(([key, value]) => (
          <div key={key} className="header-row">
            <input
              className="input input-compact header-key"
              value={key}
              onChange={(e) => setEntry(key, e.target.value, value)}
              placeholder="Header name"
              aria-label="Header name"
            />
            <input
              className="input input-compact header-value"
              value={value}
              onChange={(e) => setEntry(key, key, e.target.value)}
              placeholder="Value"
              aria-label="Header value"
              type={
                key.toLowerCase().includes("auth") ||
                key.toLowerCase().includes("token") ||
                key.toLowerCase().includes("key") ||
                key.toLowerCase().includes("secret")
                  ? "password"
                  : "text"
              }
            />
            <button
              type="button"
              className="icon-btn destructive"
              onClick={() => removeEntry(key)}
              title="Remove header"
              aria-label="Remove header"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    );
  }

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

          {/* Built-in tools — per-group toggles */}
          <div className="dlg-section">
            <div className="dlg-section-head">
              <div className="builtin-tools-label">
                <span className="eyebrow">Built-in Tools</span>
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
                All
              </label>
            </div>
            {config.builtinToolsEnabled && (
              <div className="tool-groups">
                {TOOL_GROUPS.map((group) => {
                  const enabled =
                    config.builtinToolGroups?.[group.id] !== false;
                  const isDesktop = group.id === "desktop";
                  return (
                    <div
                      key={group.id}
                      className={`tool-group-item${enabled ? "" : " disabled"}`}
                    >
                      <div className="tool-group-head">
                        <span className="tool-group-label">{group.label}</span>
                        <label className="toggle">
                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={(e) =>
                              onUpdate({
                                builtinToolGroups: {
                                  ...config.builtinToolGroups,
                                  [group.id]: e.target.checked,
                                },
                              })
                            }
                          />
                          On
                        </label>
                      </div>
                      <span className="tool-group-tools">
                        {group.description}
                      </span>
                      {isDesktop && enabled && (
                        <div className="desktop-mode-row">
                          <label className="dlg-label-sm">Mode</label>
                          <select
                            className="select select-compact"
                            value={config.computerUseMode ?? "guided"}
                            onChange={(e) =>
                              onUpdate({
                                computerUseMode: e.target.value as
                                  | "full"
                                  | "guided",
                              })
                            }
                          >
                            <option value="guided">
                              Guided (shows overlay, user acts)
                            </option>
                            <option value="full">
                              Full (controls mouse & keyboard)
                            </option>
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
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
                      <>
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
                        <div className="dlg-row">
                          <label className="dlg-label-sm">Auth</label>
                          <select
                            className="select select-compact"
                            value={s.auth ?? "none"}
                            onChange={(e) =>
                              updateServer(s.id, {
                                auth: e.target.value as McpAuthMode,
                              })
                            }
                          >
                            <option value="none">None</option>
                            <option value="headers">Headers</option>
                            <option value="oauth">OAuth</option>
                          </select>
                        </div>
                        {s.auth === "headers" && (
                          <HeadersEditor
                            headers={s.headers ?? {}}
                            onChange={(headers) =>
                              updateServer(s.id, { headers })
                            }
                          />
                        )}
                        {s.auth === "oauth" && <OAuthStatus serverId={s.id} />}
                      </>
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
