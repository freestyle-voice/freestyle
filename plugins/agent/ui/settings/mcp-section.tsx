import type { McpServerConfig } from "../shared/types";
import {
  cardStyle,
  dangerBtnStyle,
  fieldStackStyle,
  ghostBtnStyle,
  inputStyle,
  labelStyle,
  rowStyle,
  sectionHeadStyle,
  sectionStyle,
  sectionTitleStyle,
  subtitleStyle,
} from "./styles";

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
    <section style={sectionStyle}>
      <div style={sectionHeadStyle}>
        <h2 style={sectionTitleStyle}>MCP servers</h2>
        <button type="button" style={ghostBtnStyle} onClick={add}>
          + Add server
        </button>
      </div>
      <p style={{ ...subtitleStyle, marginTop: 0 }}>
        Connect Model Context Protocol servers to give the agent tools. Each
        enabled server's tools are available during a turn.
      </p>

      {servers.length === 0 && (
        <p style={{ ...subtitleStyle, opacity: 0.5 }}>No servers configured.</p>
      )}

      {servers.map((s) => (
        <div key={s.id} style={cardStyle}>
          <div style={{ ...rowStyle, marginBottom: 10 }}>
            <input
              style={{ ...inputStyle, flex: 1 }}
              value={s.name}
              onChange={(e) => update(s.id, { name: e.target.value })}
              placeholder="Server name"
            />
            <label style={{ ...rowStyle, fontSize: 12, gap: 4 }}>
              <input
                type="checkbox"
                checked={s.enabled}
                onChange={(e) => update(s.id, { enabled: e.target.checked })}
              />
              Enabled
            </label>
            <button
              type="button"
              style={dangerBtnStyle}
              onClick={() => onChange(servers.filter((x) => x.id !== s.id))}
            >
              Remove
            </button>
          </div>

          <div style={fieldStackStyle}>
            <div>
              <label style={labelStyle}>Transport</label>
              <select
                style={inputStyle}
                value={s.transport}
                onChange={(e) =>
                  update(s.id, {
                    transport: e.target.value as "stdio" | "http",
                  })
                }
              >
                <option value="stdio">stdio (local command)</option>
                <option value="http">http (remote URL)</option>
              </select>
            </div>

            {s.transport === "stdio" ? (
              <>
                <div>
                  <label style={labelStyle}>Command</label>
                  <input
                    style={inputStyle}
                    value={s.command ?? ""}
                    onChange={(e) => update(s.id, { command: e.target.value })}
                    placeholder="npx"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Arguments (one per line)</label>
                  <textarea
                    style={{ ...inputStyle, minHeight: 60, resize: "vertical" }}
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
                </div>
              </>
            ) : (
              <div>
                <label style={labelStyle}>URL</label>
                <input
                  style={inputStyle}
                  value={s.url ?? ""}
                  onChange={(e) => update(s.id, { url: e.target.value })}
                  placeholder="https://example.com/mcp"
                />
              </div>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
