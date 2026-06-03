// Freestyle — Dictionary, Formats, Feedback screens.

// ============================================================
// DICTIONARY — refined list with editorial header
// ============================================================
function DictionaryScreen() {
  const entries = [
    { key: 'btw',           val: 'by the way',                                       used: 142 },
    { key: 'my address',    val: '847 Mission Street, Apt 4, San Francisco CA 94103',used: 38 },
    { key: 'sig',           val: '— Aditya · Eng @ Freestyle',                       used: 91 },
    { key: 'eta',           val: 'estimated time of arrival',                        used: 7 },
    { key: 'sf',            val: 'San Francisco',                                    used: 24 },
    { key: 'lgtm',          val: "looks good to me — shipping",                      used: 18 },
    { key: 'my number',     val: '+1 (415) 555-0142',                                used: 12 },
  ];
  return (
    <MacWindow title="Freestyle — Dictionary">
      <SidebarA active="dictionary" />
      <main style={{ flex: 1, padding: '36px 48px 48px', overflow:'auto', background: R.CANVAS }}>
        <PageHeader title="|Dictionary|. " subtitle="Shortcuts that expand as you speak. Say the key, get the value." />

        <div style={{ display:'flex', alignItems:'center', gap: 10, marginBottom: 20 }}>
          <div style={{
            flex: 1, display:'flex', alignItems:'center', gap: 8,
            padding: '8px 12px', background: R.ELEVATED, border: `1px solid ${R.RULE}`,
            borderRadius: 8, fontSize: 13,
          }}>
            <span style={{ color: R.MUTE, display:'inline-flex' }}>{I.search({ size: 14 })}</span>
            <span style={{ color: R.MUTE, flex: 1 }}>Search dictionary…</span>
            <span className="mono" style={{ fontSize: 10, color: R.MUTE }}>⌘ K</span>
          </div>
          <Btn kind="ghost" icon={I.download}>Export</Btn>
          <Btn kind="ghost" icon={I.upload}>Import</Btn>
          <Btn kind="primary" icon={I.plus}>Add entry</Btn>
        </div>

        {/* The "add new" inline form, expanded */}
        <div style={{
          background: R.ELEVATED, border: `1px solid ${R.RULE}`, borderRadius: 12,
          padding: '16px 18px', marginBottom: 24, display:'grid', gridTemplateColumns:'1fr 1fr', gap: 14,
        }}>
          <div>
            <div className="mono" style={{ fontSize: 10, letterSpacing:'0.16em', textTransform:'uppercase', color: R.MUTE, marginBottom: 6 }}>
              Key · phrase to detect
            </div>
            <div style={{
              padding: '8px 11px', background: R.CANVAS, border: `1px solid ${R.RULE}`,
              borderRadius: 7, fontSize: 13, color: R.INK_SOFT, fontStyle:'italic',
            }}>e.g. “my address”</div>
          </div>
          <div>
            <div className="mono" style={{ fontSize: 10, letterSpacing:'0.16em', textTransform:'uppercase', color: R.MUTE, marginBottom: 6 }}>
              Value · replacement text
            </div>
            <div style={{
              padding: '8px 11px', background: R.CANVAS, border: `1px solid ${R.RULE}`,
              borderRadius: 7, fontSize: 13, color: R.INK_SOFT, fontStyle:'italic',
            }}>e.g. “847 Mission Street, Apt 4, SF…”</div>
          </div>
        </div>

        {/* Entries — list view */}
        <div style={{
          background: R.ELEVATED, border: `1px solid ${R.RULE}`, borderRadius: 12,
          overflow: 'hidden',
        }}>
          {entries.map((e, i) => (
            <div key={i} style={{
              display:'grid', gridTemplateColumns: '160px 1fr 80px 80px',
              gap: 14, padding: '14px 20px',
              borderBottom: i === entries.length - 1 ? 'none' : `1px solid ${R.RULE_SOFT}`,
              alignItems: 'center',
            }}>
              <span className="mono" style={{
                fontSize: 12.5, color: R.INK, fontWeight: 500,
                padding: '3px 8px', background: R.CANVAS, borderRadius: 5,
                border: `1px solid ${R.RULE}`, justifySelf:'start',
              }}>{e.key}</span>
              <span style={{ fontSize: 13, color: R.INK_SOFT, lineHeight: 1.4 }}>{e.val}</span>
              <span className="mono" style={{ fontSize: 11, color: R.MUTE, textAlign:'right' }}>
                {e.used}× used
              </span>
              <div style={{ display:'flex', gap: 4, justifyContent:'flex-end' }}>
                <span style={{ padding: 5, color: R.MUTE, cursor:'pointer' }}>{I.edit({ size: 13 })}</span>
                <span style={{ padding: 5, color: R.MUTE, cursor:'pointer' }}>{I.trash({ size: 13 })}</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 14, fontSize: 12, color: R.MUTE, textAlign:'center' }}>
          {entries.length} entries · pagination off
        </div>
      </main>
    </MacWindow>
  );
}

// ============================================================
// FORMATS — per-app rule cards
// ============================================================
function FormatsScreen() {
  const rules = {
    custom: [
      { label: 'Slack to colleagues', pattern: 'Slack', instr: "Keep it casual. Use lowercase, contractions, and minimal punctuation. Replace formal phrasing with chat-friendly equivalents." },
    ],
    defaults: [
      { label: 'Email', pattern: 'mail.google.com | outlook | Spark | mail.app', instr: "Format as a polite, complete email. Add greeting and signature lines if appropriate. Use proper punctuation and paragraph breaks." },
      { label: 'Code editor', pattern: 'Cursor | Code | Xcode | IntelliJ', instr: "Plain text only. No leading or trailing punctuation. Preserve technical terms exactly as spoken." },
      { label: 'Linear / Jira', pattern: 'linear | jira | github', instr: "Structure as a short ticket: lead with the verb, include reproduction steps if mentioned, keep it terse." },
      { label: 'Notes / journal', pattern: 'Notes | Bear | Obsidian | Day One', instr: "Preserve all words including filler. This is personal — don't sanitize." },
    ],
  };

  return (
    <MacWindow title="Freestyle — Formats">
      <SidebarA active="formats" />
      <main style={{ flex: 1, padding: '36px 48px 48px', overflow:'auto', background: R.CANVAS }}>
        <PageHeader title="|Formats|. " subtitle="Per-app instructions sent to the LLM. Match by app name, URL, or page title — case-insensitive, pipe-separated." />

        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom: 20 }}>
          <Btn kind="primary" icon={I.plus}>Add format</Btn>
          <Btn kind="ghost">Reset to defaults</Btn>
        </div>

        {/* Custom */}
        <div style={{ marginBottom: 28 }}>
          <div className="mono" style={{
            fontSize: 10, color: R.MUTE, letterSpacing: '0.18em', textTransform:'uppercase', marginBottom: 12,
          }}>Custom</div>
          <div style={{ display:'flex', flexDirection:'column', gap: 10 }}>
            {rules.custom.map((r, i) => <FormatCard key={i} rule={r} custom />)}
          </div>
        </div>

        {/* Defaults */}
        <div>
          <div className="mono" style={{
            fontSize: 10, color: R.MUTE, letterSpacing: '0.18em', textTransform:'uppercase', marginBottom: 12,
          }}>Defaults</div>
          <div style={{ display:'flex', flexDirection:'column', gap: 10 }}>
            {rules.defaults.map((r, i) => <FormatCard key={i} rule={r} />)}
          </div>
        </div>
      </main>
    </MacWindow>
  );
}

function FormatCard({ rule, custom }) {
  return (
    <div style={{
      background: R.ELEVATED, border: `1px solid ${custom ? R.OLIVE : R.RULE}`, borderRadius: 12,
      padding: '16px 18px', display:'flex', gap: 16,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 8,
        background: custom ? R.OLIVE_SOFT : R.PAPER,
        border: `1px solid ${custom ? R.OLIVE : R.RULE}33`,
        display:'flex', alignItems:'center', justifyContent:'center', flexShrink: 0,
      }}>
        <span style={{ color: custom ? R.OLIVE_DEEP : R.MUTE, display:'inline-flex' }}>{I.fileText({ size: 16 })}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display:'flex', alignItems:'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: R.INK }}>{rule.label}</span>
          {custom && (
            <span className="mono" style={{
              fontSize: 9, padding: '2px 6px', background: R.OLIVE, color: R.CANVAS,
              borderRadius: 999, letterSpacing: '0.14em',
            }}>CUSTOM</span>
          )}
          <span className="mono" style={{
            fontSize: 10, padding: '2px 7px', background: R.CANVAS, color: R.INK_SOFT,
            border: `1px solid ${R.RULE}`, borderRadius: 4, marginLeft: 4,
          }}>{rule.pattern}</span>
        </div>
        <p className="serif" style={{
          margin: 0, fontSize: 15, color: R.INK_SOFT, lineHeight: 1.5, maxWidth: 720,
          fontWeight: 450,
        }}>
          “{rule.instr}”
        </p>
      </div>
      <div style={{ display:'flex', gap: 4, alignSelf:'flex-start' }}>
        <span style={{ padding: 5, color: R.MUTE, cursor:'pointer' }}>{I.edit({ size: 13 })}</span>
        {custom && <span style={{ padding: 5, color: R.MUTE, cursor:'pointer' }}>{I.trash({ size: 13 })}</span>}
      </div>
    </div>
  );
}

// ============================================================
// FEEDBACK — pushed editorial
// ============================================================
function FeedbackScreen() {
  return (
    <MacWindow title="Freestyle — Feedback">
      <SidebarA active="feedback" />
      <main style={{ flex: 1, padding: '36px 48px 48px', overflow:'auto', background: R.CANVAS }}>

        <div style={{ marginBottom: 32 }}>
          <Eyebrow text="Feedback" />
          <h1 style={{ margin: '10px 0 8px', fontSize: 56, lineHeight: 0.95, letterSpacing:'-0.025em', fontWeight: 400 }}>
            <span className="serif">Tell us </span>
            <span className="serif-italic" style={{ color: R.OLIVE }}>what's broken.</span>
          </h1>
          <p style={{ margin: 0, fontSize: 15, color: R.INK_SOFT, lineHeight: 1.5, maxWidth: 580 }}>
            Or what's working, or what you wish existed. We read everything — and we're a small team, so we usually reply.
          </p>
        </div>

        <div style={{
          background: R.ELEVATED, border: `1px solid ${R.RULE}`, borderRadius: 14,
          padding: 28, display:'flex', flexDirection:'column', gap: 18, maxWidth: 720,
        }}>
          {/* Type chips */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: R.INK, marginBottom: 8 }}>Type</div>
            <div style={{ display:'flex', gap: 8 }}>
              {['General','Bug report','Feature request'].map((t, i) => (
                <div key={t} style={{
                  padding: '7px 14px', borderRadius: 8, fontSize: 13,
                  background: i === 1 ? R.OLIVE_SOFT : 'transparent',
                  border: `1px solid ${i === 1 ? R.OLIVE : R.RULE}`,
                  color: i === 1 ? R.OLIVE_INK : R.INK_SOFT,
                  fontWeight: i === 1 ? 500 : 400,
                  cursor:'default',
                }}>{t}</div>
              ))}
            </div>
          </div>

          {/* Message */}
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: R.INK }}>Message</span>
              <span className="mono" style={{ fontSize: 10.5, color: R.MUTE, letterSpacing:'0.06em' }}>198 / 2000</span>
            </div>
            <div style={{
              padding: '14px 16px', background: R.CANVAS,
              border: `1px solid ${R.RULE}`, borderRadius: 10,
              minHeight: 140, fontSize: 14, lineHeight: 1.55, color: R.INK,
            }}>
              <p style={{ margin: 0 }}>
                The pill shows “Pasted” even when accessibility permission is off — the clipboard write succeeds but the paste shortcut never fires, so nothing actually lands at my cursor. Could the pill surface that and link to System Settings?
              </p>
            </div>
          </div>

          {/* Email */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: R.INK, marginBottom: 8 }}>
              Email <span style={{ color: R.MUTE, fontWeight: 400 }}>(optional, for follow-up)</span>
            </div>
            <div style={{
              padding: '10px 14px', background: R.CANVAS,
              border: `1px solid ${R.RULE}`, borderRadius: 8,
              fontSize: 13.5, color: R.INK,
            }}>aditya@example.com</div>
          </div>

          <div style={{ display:'flex', justifyContent:'flex-end', gap: 10, marginTop: 4 }}>
            <Btn kind="ghost">Cancel</Btn>
            <Btn kind="primary" icon={I.send}>Send feedback</Btn>
          </div>
        </div>
      </main>
    </MacWindow>
  );
}

Object.assign(window, {
  DictionaryScreen, FormatsScreen, FeedbackScreen,
});
