import { useCallback, useEffect, useState } from "react";
import { getJson, putJson } from "../shared/api";
import type { AgentConfig } from "../shared/types";
import { McpSection } from "./mcp-section";
import { SkillsSection } from "./skills-section";
import {
  h1Style,
  inputStyle,
  labelStyle,
  pageStyle,
  primaryBtnStyle,
  savedPillStyle,
  sectionStyle,
  sectionTitleStyle,
  subtitleStyle,
  textareaStyle,
} from "./styles";

const EMPTY: AgentConfig = {
  systemPrompt: "",
  wakeWord: "hey freestyle",
  mcpServers: [],
  skills: [],
};

export function SettingsPage(): React.JSX.Element {
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void getJson<AgentConfig>("/config").then((c) => setConfig(c ?? EMPTY));
  }, []);

  const save = useCallback(async (next: AgentConfig) => {
    setConfig(next);
    const result = await putJson<AgentConfig>("/config", next);
    if (result) {
      setConfig(result);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    }
  }, []);

  if (!config) {
    return <div style={pageStyle}>Loading…</div>;
  }

  return (
    <div style={pageStyle}>
      <h1 style={h1Style}>Voice Agent</h1>
      <p style={subtitleStyle}>
        Talk to an AI agent by voice. Say your wake word to open a chat panel on
        the pill; connect MCP servers for tools and define skills to shape its
        behavior.
      </p>

      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>Trigger</h2>
        <div style={{ marginTop: 12 }}>
          <label style={labelStyle} htmlFor="wake">
            Wake word
          </label>
          <input
            id="wake"
            style={inputStyle}
            value={config.wakeWord}
            onChange={(e) => setConfig({ ...config, wakeWord: e.target.value })}
            onBlur={() => save(config)}
            placeholder="hey freestyle"
          />
          <p style={{ ...subtitleStyle, margin: "6px 0 0" }}>
            Dictation starting with this phrase is sent to the agent instead of
            being typed. A leading "hey"/"ok" is always optional.
          </p>
        </div>
      </section>

      <section style={sectionStyle}>
        <h2 style={sectionTitleStyle}>Persona</h2>
        <div style={{ marginTop: 12 }}>
          <label style={labelStyle} htmlFor="prompt">
            System prompt
          </label>
          <textarea
            id="prompt"
            style={textareaStyle}
            value={config.systemPrompt}
            onChange={(e) =>
              setConfig({ ...config, systemPrompt: e.target.value })
            }
            onBlur={() => save(config)}
          />
        </div>
      </section>

      <McpSection
        servers={config.mcpServers}
        onChange={(mcpServers) => save({ ...config, mcpServers })}
      />

      <SkillsSection
        skills={config.skills}
        onChange={(skills) => save({ ...config, skills })}
      />

      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
        <button
          type="button"
          style={primaryBtnStyle}
          onClick={() => save(config)}
        >
          Save
        </button>
        {saved && <span style={savedPillStyle}>Saved</span>}
      </div>
    </div>
  );
}
