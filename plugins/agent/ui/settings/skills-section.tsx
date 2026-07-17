import type { Skill } from "../shared/types";
import {
  cardHeadStyle,
  cardStyle,
  emptyRowStyle,
  ghostBtnStyle,
  iconGhostBtnStyle,
  inputStyle,
  labelStyle,
  sectionDescStyle,
  sectionHeadStyle,
  sectionIconStyle,
  sectionStyle,
  sectionTitleRowStyle,
  sectionTitleStyle,
  textareaStyle,
  toggleWrapStyle,
} from "./styles";

function uid(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

export function SkillsSection(props: {
  skills: Skill[];
  onChange: (skills: Skill[]) => void;
}): React.JSX.Element {
  const { skills, onChange } = props;

  const update = (id: string, patch: Partial<Skill>) =>
    onChange(skills.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const add = () =>
    onChange([
      ...skills,
      { id: uid(), name: "New skill", instructions: "", enabled: true },
    ]);

  return (
    <section style={sectionStyle}>
      <div style={sectionHeadStyle}>
        <div style={sectionTitleRowStyle}>
          <span style={sectionIconStyle} aria-hidden>
            ✦
          </span>
          <h2 style={sectionTitleStyle}>Skills</h2>
        </div>
        <button type="button" style={ghostBtnStyle} onClick={add}>
          <span aria-hidden>＋</span> Add skill
        </button>
      </div>
      <p style={sectionDescStyle}>
        Reusable instruction sets. Enabled skills are appended to the system
        prompt so the agent applies them on every turn.
      </p>

      {skills.length === 0 && (
        <div style={emptyRowStyle}>No skills defined yet.</div>
      )}

      {skills.map((s) => (
        <div key={s.id} style={cardStyle}>
          <div style={cardHeadStyle}>
            <input
              style={{ ...inputStyle, flex: 1 }}
              value={s.name}
              onChange={(e) => update(s.id, { name: e.target.value })}
              placeholder="Skill name"
              aria-label="Skill name"
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
              onClick={() => onChange(skills.filter((x) => x.id !== s.id))}
              title="Remove skill"
              aria-label="Remove skill"
            >
              ✕
            </button>
          </div>
          <label style={labelStyle}>Instructions</label>
          <textarea
            style={textareaStyle}
            value={s.instructions}
            onChange={(e) => update(s.id, { instructions: e.target.value })}
            placeholder="e.g. When asked to summarize, reply in three bullet points."
          />
        </div>
      ))}
    </section>
  );
}
