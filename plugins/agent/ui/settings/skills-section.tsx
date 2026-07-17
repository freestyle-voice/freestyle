import type { Skill } from "../shared/types";
import {
  cardStyle,
  dangerBtnStyle,
  ghostBtnStyle,
  inputStyle,
  labelStyle,
  rowStyle,
  sectionHeadStyle,
  sectionStyle,
  sectionTitleStyle,
  subtitleStyle,
  textareaStyle,
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
        <h2 style={sectionTitleStyle}>Skills</h2>
        <button type="button" style={ghostBtnStyle} onClick={add}>
          + Add skill
        </button>
      </div>
      <p style={{ ...subtitleStyle, marginTop: 0 }}>
        Reusable instruction sets. Enabled skills are appended to the system
        prompt so the agent applies them on every turn.
      </p>

      {skills.length === 0 && (
        <p style={{ ...subtitleStyle, opacity: 0.5 }}>No skills defined.</p>
      )}

      {skills.map((s) => (
        <div key={s.id} style={cardStyle}>
          <div style={{ ...rowStyle, marginBottom: 10 }}>
            <input
              style={{ ...inputStyle, flex: 1 }}
              value={s.name}
              onChange={(e) => update(s.id, { name: e.target.value })}
              placeholder="Skill name"
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
              onClick={() => onChange(skills.filter((x) => x.id !== s.id))}
            >
              Remove
            </button>
          </div>
          <label style={labelStyle}>Instructions</label>
          <textarea
            style={textareaStyle}
            value={s.instructions}
            onChange={(e) => update(s.id, { instructions: e.target.value })}
            placeholder="e.g. When asked to summarize, use three bullet points."
          />
        </div>
      ))}
    </section>
  );
}
