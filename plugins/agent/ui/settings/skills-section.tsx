import type { Skill } from "../shared/types";

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
    <section className="card">
      <div className="card-head">
        <div>
          <div className="eyebrow">Behavior</div>
          <h2>Skills</h2>
          <p className="card-desc">
            Reusable instruction sets, appended to the prompt when enabled.
          </p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={add}>
          + Add skill
        </button>
      </div>

      {skills.length === 0 && (
        <p className="item-empty">No skills defined yet.</p>
      )}

      {skills.map((s) => (
        <div key={s.id} className="item">
          <div className="item-head">
            <input
              className="input item-name"
              value={s.name}
              onChange={(e) => update(s.id, { name: e.target.value })}
              placeholder="Skill name"
              aria-label="Skill name"
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
              onClick={() => onChange(skills.filter((x) => x.id !== s.id))}
              title="Remove skill"
              aria-label="Remove skill"
            >
              ✕
            </button>
          </div>
          <div className="field">
            <span className="label">Instructions</span>
            <textarea
              className="textarea"
              value={s.instructions}
              onChange={(e) => update(s.id, { instructions: e.target.value })}
              placeholder="e.g. When asked to summarize, reply in three bullet points."
            />
          </div>
        </div>
      ))}
    </section>
  );
}
