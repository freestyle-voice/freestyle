import { useCallback, useEffect, useState } from "react";
import { getJson, putJson } from "../shared/api";
import type { AgentConfig } from "../shared/types";
import { McpSection } from "./mcp-section";
import { SkillsSection } from "./skills-section";
import {
  containerStyle,
  h1Style,
  heroMarkStyle,
  heroStyle,
  hintTextStyle,
  inputStyle,
  labelStyle,
  pageStyle,
  primaryBtnStyle,
  saveBarStyle,
  savedPillStyle,
  sectionDescStyle,
  sectionIconStyle,
  sectionStyle,
  sectionTitleRowStyle,
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
      setTimeout(() => setSaved(false), 1600);
    }
  }, []);

  if (!config) {
    return (
      <div style={pageStyle}>
        <div style={containerStyle}>Loading…</div>
      </div>
    );
  }

  return (
    <div style={pageStyle}>
      <div style={containerStyle}>
        <header style={heroStyle}>
          <span style={heroMarkStyle} aria-hidden>
            ✦
          </span>
          <div>
            <h1 style={h1Style}>Voice Agent</h1>
            <p style={subtitleStyle}>
              Talk to an AI agent by voice. Say your wake word to open a chat
              panel on the pill — give it tools with MCP servers and shape it
              with skills.
            </p>
          </div>
        </header>

        <section style={sectionStyle}>
          <div style={sectionTitleRowStyle}>
            <span style={sectionIconStyle} aria-hidden>
              ⌘
            </span>
            <h2 style={sectionTitleStyle}>Trigger</h2>
          </div>
          <p style={sectionDescStyle}>How you summon the agent.</p>
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
          <p style={hintTextStyle}>
            Dictation starting with this phrase goes to the agent instead of
            being typed. A leading “hey” / “ok” is always optional.
          </p>
        </section>

        <section style={sectionStyle}>
          <div style={sectionTitleRowStyle}>
            <span style={sectionIconStyle} aria-hidden>
              ✎
            </span>
            <h2 style={sectionTitleStyle}>Persona</h2>
          </div>
          <p style={sectionDescStyle}>The agent's base instructions.</p>
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
        </section>

        <McpSection
          servers={config.mcpServers}
          onChange={(mcpServers) => save({ ...config, mcpServers })}
        />

        <SkillsSection
          skills={config.skills}
          onChange={(skills) => save({ ...config, skills })}
        />

        <div style={saveBarStyle}>
          {saved && (
            <span style={savedPillStyle}>
              <span aria-hidden>✓</span> Saved
            </span>
          )}
          <button
            type="button"
            style={primaryBtnStyle}
            onClick={() => save(config)}
          >
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
