import { useCallback, useEffect, useRef, useState } from "react";
import { del, getJson, postJson, putJson } from "../shared/api";
import {
  type AgentConfig,
  DEFAULT_SYSTEM_PROMPT,
  type McpAuthMode,
  type McpServerConfig,
  type Skill,
  TOOL_GROUPS,
  uid,
} from "../shared/types";

/* ---- OAuth status ---- */

function OAuthStatus({
  serverId,
  dirty,
  onSave,
}: {
  serverId: string;
  /** Whether the form has unsaved changes (OAuth needs the saved config). */
  dirty: boolean;
  /** Persist the current draft; resolves once saved. */
  onSave: () => Promise<void>;
}): React.JSX.Element {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
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
        setMessage("Authorized");
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
    setMessage(null);
    // OAuth reads the *saved* server config, so persist any pending changes
    // first (e.g. the user just switched auth to "oauth" or entered the URL).
    if (dirty) {
      setMessage("Saving…");
      await onSave();
    }
    setMessage("Opening browser…");
    const res = await postJson<{ status?: string; message?: string }>(
      `/oauth/connect?server_id=${encodeURIComponent(serverId)}`,
    );
    if (!res) {
      setBusy(false);
      setMessage("Failed — check the server URL and try again.");
      return;
    }
    if (res.status === "authorized") {
      setAuthorized(true);
      setBusy(false);
      setMessage("Authorized");
      return;
    }
    if (res.status === "error") {
      setBusy(false);
      setMessage(res.message ?? "Authorization failed.");
      return;
    }
    // "redirecting" — poll for completion.
    setMessage("Complete sign-in in your browser…");
    pollRef.current = setInterval(() => void checkStatus(), 2000);
    setTimeout(() => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
        setBusy(false);
        setMessage((m) => (m === "Authorized" ? m : "Timed out — try again."));
      }
    }, 120_000);
  };

  const handleRevoke = async () => {
    await del(`/oauth/revoke?server_id=${encodeURIComponent(serverId)}`);
    setAuthorized(false);
    setMessage(null);
  };

  return (
    <div className="oauth-status">
      <span className={`oauth-dot ${authorized ? "oauth-ok" : "oauth-none"}`} />
      <span className="oauth-label">
        {message ??
          (authorized === null
            ? "Checking…"
            : authorized
              ? "Authorized"
              : "Not authorized")}
      </span>
      {authorized ? (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => void handleRevoke()}
        >
          Revoke
        </button>
      ) : (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => void handleAuthorize()}
          disabled={busy}
        >
          {busy ? "Waiting…" : "Authorize"}
        </button>
      )}
    </div>
  );
}

/* ---- Headers editor ---- */

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
        <span className="field-label">Headers</span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={addEntry}
        >
          + Add
        </button>
      </div>
      {entries.length === 0 && <span className="hint">No custom headers.</span>}
      {entries.map(([key, value]) => (
        <div key={key} className="header-row">
          <input
            className="input input-compact header-key"
            value={key}
            onChange={(e) => setEntry(key, e.target.value, value)}
            placeholder="Header name"
          />
          <input
            className="input input-compact header-value"
            value={value}
            onChange={(e) => setEntry(key, key, e.target.value)}
            placeholder="Value"
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
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}

/* ---- Main settings form ---- */

interface Props {
  config: AgentConfig;
  onSave: (config: AgentConfig) => void;
  onBack: () => void;
}

export function SettingsForm({
  config: initial,
  onSave,
  onBack,
}: Props): React.JSX.Element {
  const [draft, setDraft] = useState<AgentConfig>(() =>
    structuredClone(initial),
  );
  const [saving, setSaving] = useState(false);
  // Baseline snapshot for the dirty check. An in-place save (e.g. before OAuth)
  // updates this without navigating away, clearing the dirty state.
  const [initialSnapshot, setInitialSnapshot] = useState(() =>
    JSON.stringify(initial),
  );
  const dirty = JSON.stringify(draft) !== initialSnapshot;

  const patch = (p: Partial<AgentConfig>) => setDraft((d) => ({ ...d, ...p }));

  // ---- Built-in tool group toggles ----
  const enabledCount = TOOL_GROUPS.filter(
    (g) => draft.builtinToolGroups?.[g.id] !== false,
  ).length;
  const allToolsChecked = enabledCount === TOOL_GROUPS.length;
  const someToolsChecked = enabledCount > 0 && !allToolsChecked;

  // Reflect the mixed state as an indeterminate ("-") checkbox.
  const allToolsRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (allToolsRef.current) {
      allToolsRef.current.indeterminate = someToolsChecked;
    }
  }, [someToolsChecked]);

  const setGroupEnabled = (id: string, enabled: boolean) => {
    const groups = { ...draft.builtinToolGroups, [id]: enabled };
    patch({
      builtinToolGroups: groups,
      // Keep the master flag in sync: on if any group is enabled.
      builtinToolsEnabled: Object.values(groups).some((v) => v !== false),
    });
  };

  const toggleAllTools = (on: boolean) => {
    const groups: Record<string, boolean> = {};
    for (const g of TOOL_GROUPS) groups[g.id] = on;
    patch({ builtinToolGroups: groups, builtinToolsEnabled: on });
  };

  const updateServer = (id: string, p: Partial<McpServerConfig>) =>
    patch({
      mcpServers: draft.mcpServers.map((s) =>
        s.id === id ? { ...s, ...p } : s,
      ),
    });

  const addServer = () =>
    patch({
      mcpServers: [
        ...draft.mcpServers,
        {
          id: uid(),
          name: "",
          transport: "stdio" as const,
          command: "",
          args: [],
          enabled: false,
        },
      ],
    });

  const removeServer = (id: string) =>
    patch({ mcpServers: draft.mcpServers.filter((s) => s.id !== id) });

  const updateSkill = (id: string, p: Partial<Skill>) =>
    patch({
      skills: draft.skills.map((s) => (s.id === id ? { ...s, ...p } : s)),
    });

  const addSkill = () =>
    patch({
      skills: [
        ...draft.skills,
        { id: uid(), name: "", instructions: "", enabled: true },
      ],
    });

  const removeSkill = (id: string) =>
    patch({ skills: draft.skills.filter((s) => s.id !== id) });

  /** Persist the current draft without navigating away (used by OAuth). */
  const saveDraft = useCallback(async () => {
    await putJson("/config", draft);
    // The draft is now the saved baseline — clears the dirty state.
    setInitialSnapshot(JSON.stringify(draft));
  }, [draft]);

  const handleSave = async () => {
    setSaving(true);
    await putJson("/config", draft);
    onSave(draft);
    setSaving(false);
  };

  const handleBack = () => {
    onBack();
  };

  return (
    <div className="settings-view">
      {/* Toolbar */}
      <div className="settings-toolbar">
        <button type="button" className="back-btn" onClick={handleBack}>
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
        <h2 className="settings-title">Settings</h2>
        <div className="settings-toolbar-right">
          {dirty && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setDraft(JSON.parse(initialSnapshot))}
            >
              Discard
            </button>
          )}
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void handleSave()}
            disabled={!dirty || saving}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {/* Scrollable form */}
      <div className="settings-body">
        {/* Identity + System Prompt in one section */}
        <section className="form-section">
          <h3 className="section-title">General</h3>
          <div className="field">
            <label className="field-label" htmlFor="agent-name">
              Agent name
            </label>
            <input
              id="agent-name"
              className="input"
              value={draft.agentName}
              onChange={(e) => patch({ agentName: e.target.value })}
              placeholder="Freestyle"
            />
            <span className="hint">
              The name spoken to summon the agent (e.g. "Hey Freestyle, ...").
            </span>
          </div>
          <div className="field">
            <div className="field-label-row">
              <label className="field-label" htmlFor="sys-prompt">
                System prompt
              </label>
              {draft.systemPrompt !== DEFAULT_SYSTEM_PROMPT && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => patch({ systemPrompt: DEFAULT_SYSTEM_PROMPT })}
                >
                  Reset to default
                </button>
              )}
            </div>
            <textarea
              id="sys-prompt"
              className="textarea"
              value={draft.systemPrompt}
              onChange={(e) => patch({ systemPrompt: e.target.value })}
              placeholder="You are a helpful voice assistant..."
              rows={4}
            />
            <span className="hint">
              Base instructions. Enabled skills are appended automatically.
            </span>
          </div>
        </section>

        {/* Built-in Tools */}
        <section className="form-section">
          <div className="section-header">
            <h3 className="section-title">
              Built-in Tools
              <span className="badge badge-builtin">Built-in</span>
            </h3>
            <label className="toggle">
              <input
                ref={allToolsRef}
                type="checkbox"
                checked={allToolsChecked}
                onChange={(e) => toggleAllTools(e.target.checked)}
              />
              All
            </label>
          </div>
          <div className="tool-groups">
            {TOOL_GROUPS.map((group) => {
              const enabled = draft.builtinToolGroups?.[group.id] !== false;
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
                          setGroupEnabled(group.id, e.target.checked)
                        }
                      />
                      On
                    </label>
                  </div>
                  <span className="tool-group-tools">{group.description}</span>
                  {isDesktop && enabled && (
                    <div className="desktop-mode-row">
                      <span className="field-label">Mode</span>
                      <select
                        className="select select-compact"
                        value={draft.computerUseMode ?? "guided"}
                        onChange={(e) =>
                          patch({
                            computerUseMode: e.target.value as
                              | "full"
                              | "guided",
                          })
                        }
                      >
                        <option value="guided">Guided</option>
                        <option value="full">Full control</option>
                      </select>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* MCP Servers */}
        <section className="form-section">
          <div className="section-header">
            <h3 className="section-title">MCP Servers</h3>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={addServer}
            >
              + Add
            </button>
          </div>

          {draft.mcpServers.length === 0 && (
            <p className="item-empty">No servers connected.</p>
          )}

          {draft.mcpServers.map((s) => (
            <div key={s.id} className="form-card">
              <div className="form-card-head">
                <input
                  className="input input-compact"
                  value={s.name}
                  onChange={(e) => updateServer(s.id, { name: e.target.value })}
                  placeholder="Server name"
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
                  >
                    ✕
                  </button>
                )}
              </div>

              {!s.builtin && (
                <div className="form-card-body">
                  <div className="field-row">
                    <span className="field-label">Transport</span>
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
                      <div className="field-row">
                        <span className="field-label">Command</span>
                        <input
                          className="input input-compact"
                          value={s.command ?? ""}
                          onChange={(e) =>
                            updateServer(s.id, { command: e.target.value })
                          }
                          placeholder="npx"
                        />
                      </div>
                      <div className="field-row">
                        <span className="field-label">Args</span>
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
                      <div className="field-row">
                        <span className="field-label">URL</span>
                        <input
                          className="input input-compact"
                          value={s.url ?? ""}
                          onChange={(e) =>
                            updateServer(s.id, { url: e.target.value })
                          }
                          placeholder="https://example.com/mcp"
                        />
                      </div>
                      <div className="field-row">
                        <span className="field-label">Auth</span>
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
                      {s.auth === "oauth" && (
                        <OAuthStatus
                          serverId={s.id}
                          dirty={dirty}
                          onSave={saveDraft}
                        />
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </section>

        {/* Skills */}
        <section className="form-section">
          <div className="section-header">
            <h3 className="section-title">Skills</h3>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={addSkill}
            >
              + Add
            </button>
          </div>

          {draft.skills.length === 0 && (
            <p className="item-empty">No skills defined.</p>
          )}

          {draft.skills.map((s) => (
            <div key={s.id} className="form-card">
              <div className="form-card-head">
                <input
                  className="input input-compact"
                  value={s.name}
                  onChange={(e) => updateSkill(s.id, { name: e.target.value })}
                  placeholder="Skill name"
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
        </section>
      </div>
    </div>
  );
}
