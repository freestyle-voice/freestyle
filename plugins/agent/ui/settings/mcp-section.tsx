import type { McpServerConfig } from "../shared/types";
import {
  cardHeadStyle,
  cardStyle,
  emptyRowStyle,
  fieldStackStyle,
  ghostBtnStyle,
  hintTextStyle,
  iconGhostBtnStyle,
  inputStyle,
  labelStyle,
  monoTextareaStyle,
  sectionDescStyle,
  sectionHeadStyle,
  sectionIconStyle,
  sectionStyle,
  sectionTitleRowStyle,
  sectionTitleStyle,
  selectStyle,
  toggleWrapStyle,
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
        <div style={sectionTitleRowStyle}>
          <span style={sectionIconStyle} aria-hidden>
            ⚙
          </span>
          <h2 style={sectionTitleStyle}>MCP servers</h2>
        </div>
        <button type="button" style={ghostBtnStyle} onClick={add}>
          <span aria-hidden>＋</span> Add server
        </button>
      </div>
      <p style={sectionDescStyle}>
        Connect Model Context Protocol servers to give the agent tools. Each
        enabled server's tools are available during a turn.
      </p>

      {servers.length === 0 && (
        <div style={emptyRowStyle}>No servers connected yet.</div>
      )}

      {servers.map((s) => (
        <div key={s.id} style={cardStyle}>
          <div style={cardHeadStyle}>
            <input
              style={{ ...inputStyle, flex: 1 }}
              value={s.name}
              onChange={(e) => update(s.id, { name: e.target.value })}
              placeholder="Server name"
              aria-label="Server name"
            />
            <label style={toggleWrapStyle}>
              <input
                type="checkbox"
                checked={s.enabled}
                onChange={(e) => update(s.id, { enabled: e.target.checked })}
              />
              On
            </label>
            <button
              type="button"
              style={iconGhostBtnStyle}
              onClick={() => onChange(servers.filter((x) => x.id !== s.id))}
              title="Remove server"
              aria-label="Remove server"
            >
              ✕
            </button>
          </div>

          <div style={fieldStackStyle}>
            <div>
              <label style={labelStyle}>Transport</label>
              <select
                style={selectStyle}
                value={s.transport}
                onChange={(e) =>
                  update(s.id, {
                    transport: e.target.value as "stdio" | "http",
                  })
                }
              >
                <option value="stdio">stdio · local command</option>
                <option value="http">http · remote URL</option>
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
                  <label style={labelStyle}>Arguments</label>
                  <textarea
                    style={monoTextareaStyle}
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
                  <p style={hintTextStyle}>One argument per line.</p>
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
