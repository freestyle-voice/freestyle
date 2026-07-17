import type { McpServerConfig } from "../shared/types";

function uid(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

export function McpSection(props: {
  servers: McpServerConfig[];
  onChange: (servers: McpServerConfig[]) => void;
}): React.JSX.Element {
  const { servers, onChange } = props;

  const update = (id: string, patch: Partial<McpServerConfig>) =>
    onChange(servers.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const add = () =>
    onChange([
      ...servers,
      {
        id: uid(),
        name: "New server",
        transport: "stdio",
        command: "npx",
        args: [],
        enabled: true,
      },
    ]);

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <div className="eyebrow">Tools</div>
          <h2>MCP servers</h2>
          <p className="card-desc">
            Connect Model Context Protocol servers to give the agent tools.
          </p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={add}>
          + Add server
        </button>
      </div>

      {servers.length === 0 && (
        <p className="item-empty">No servers connected yet.</p>
      )}

      {servers.map((s) => (
        <div key={s.id} className="item">
          <div className="item-head">
            <input
              className="input item-name"
              value={s.name}
              onChange={(e) => update(s.id, { name: e.target.value })}
              placeholder="Server name"
              aria-label="Server name"
            />
            <label className="toggle">
              <input
                type="checkbox"
                checked={s.enabled}
                onChange={(e) => update(s.id, { enabled: e.target.checked })}
              />
              On
            </label>
            <button
              type="button"
              className="icon-btn"
              onClick={() => onChange(servers.filter((x) => x.id !== s.id))}
              title="Remove server"
              aria-label="Remove server"
            >
              ✕
            </button>
          </div>

          <div className="field">
            <span className="label">Transport</span>
            <select
              className="select"
              value={s.transport}
              onChange={(e) =>
                update(s.id, { transport: e.target.value as "stdio" | "http" })
              }
            >
              <option value="stdio">stdio · local command</option>
              <option value="http">http · remote URL</option>
            </select>
          </div>

          {s.transport === "stdio" ? (
            <>
              <div className="field">
                <span className="label">Command</span>
                <input
                  className="input"
                  value={s.command ?? ""}
                  onChange={(e) => update(s.id, { command: e.target.value })}
                  placeholder="npx"
                />
              </div>
              <div className="field">
                <span className="label">Arguments</span>
                <textarea
                  className="textarea mono"
                  value={(s.args ?? []).join("\n")}
                  onChange={(e) =>
                    update(s.id, {
                      args: e.target.value
                        .split("\n")
                        .map((a) => a.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder={
                    "-y\n@modelcontextprotocol/server-filesystem\n/path"
                  }
                />
                <span className="hint">One argument per line.</span>
              </div>
            </>
          ) : (
            <div className="field">
              <span className="label">URL</span>
              <input
                className="input"
                value={s.url ?? ""}
                onChange={(e) => update(s.id, { url: e.target.value })}
                placeholder="https://example.com/mcp"
              />
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
