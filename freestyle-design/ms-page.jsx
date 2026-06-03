// Models page redesign — page body: header, current-pair hero, picker mount,
// providers. Holds the choosing state machine. Seeded by `state` prop.

function Eyebrow({ text, accent }) {
  return <span className="mono" style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: accent ? T.primary : T.mutedFg }}>{text}</span>;
}

function Toggle({ on, onToggle }) {
  return (
    <button onClick={() => onToggle(!on)} style={{
      position: 'relative', height: 22, width: 40, borderRadius: 999, border: `1px solid ${on ? T.primary : T.border}`,
      background: on ? T.primary : T.secondary, flexShrink: 0, padding: 0, cursor: 'pointer',
    }} aria-pressed={on}>
      <span style={{ position: 'absolute', top: 1, left: 0, height: 18, width: 18, borderRadius: '50%', background: on ? T.primaryFg : 'rgba(123,116,97,0.7)', transform: on ? 'translateX(19px)' : 'translateX(2px)', transition: 'transform .15s' }} />
    </button>
  );
}

// provenance chip on the current voice
function ProvChip({ model }) {
  if (!model) return null;
  const local = model.kind === 'local';
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 12, padding: '5px 11px', borderRadius: 999, background: local ? T.accent : T.secondary, border: `1px solid ${local ? 'transparent' : T.border}` }}>
      <Icon name={local ? 'wifiOff' : 'cloud'} size={13} style={{ color: local ? T.accentFg : T.mutedFg }} />
      <span style={{ fontSize: 12, fontWeight: 500, color: local ? T.accentFg : T.mutedFg }}>
        {local ? 'On-device · runs offline, audio stays private' : `Cloud · audio sent to ${model.provider}`}
      </span>
    </div>
  );
}

function PairSide({ kicker, model, primary, toggle, onToggle, cta, onChange, dimmed, active }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, height: '100%', opacity: dimmed ? 0.55 : 1, transition: 'opacity .15s' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Eyebrow text={kicker} accent={primary} />
        {onToggle && <Toggle on={toggle} onToggle={onToggle} />}
      </div>
      <div>
        {model ? (
          <div className="serif" style={{ fontSize: 34, lineHeight: 1.05, letterSpacing: '-0.02em', color: T.fg }}>{model.name}</div>
        ) : (
          <div className="serif-italic" style={{ fontSize: 30, lineHeight: 1.1, color: T.mutedFg }}>None selected</div>
        )}
        {model && <div style={{ marginTop: 6, fontSize: 13, color: T.mutedFg }}>via <span style={{ color: T.fg, fontWeight: 500, opacity: 0.85 }}>{model.provider}</span></div>}
      </div>
      <div style={{ marginTop: 'auto', paddingTop: 4, display: 'flex', alignItems: 'center', gap: 10 }}>
        <button onClick={onChange} style={{
          padding: '7px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer',
          border: primary ? '1px solid transparent' : `1px solid ${T.border}`,
          background: primary ? T.fg : 'transparent', color: primary ? T.bg : T.fg,
          boxShadow: active ? `0 0 0 3px rgba(107,143,18,0.25)` : 'none',
        }}>{cta}</button>
        {primary && model && <span className="mono" style={{ fontSize: 10, letterSpacing: '0.14em', color: T.primary }}>READY</span>}
      </div>
    </div>
  );
}

function PairCard({ voice, llm, cleanup, onToggleCleanup, onChangeVoice, onChangeLlm, pickerOpen }) {
  return (
    <section style={{ border: `1px solid ${T.border}`, background: T.card, borderRadius: 14, padding: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }} className="ms-pair">
      <PairSide kicker="Voice · required" model={voice} primary cta="Change" onChange={onChangeVoice} active={pickerOpen === 'voice'} />
      <div style={{ borderLeft: `1px solid ${T.border}`, paddingLeft: 24 }} className="ms-pair-divider">
        <PairSide kicker="LLM cleanup · optional" model={cleanup ? llm : null} toggle={cleanup} onToggle={onToggleCleanup}
          cta={llm ? 'Change' : 'Pick a model'} onChange={onChangeLlm} dimmed={!cleanup} active={pickerOpen === 'llm'} />
      </div>
    </section>
  );
}

function ProvidersSection({ onAdd }) {
  return (
    <section style={{ marginTop: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <Eyebrow text="Providers & keys" />
        <button onClick={onAdd} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: `1px solid ${T.border}`, background: 'transparent', color: T.fg, fontSize: 12, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>
          <Icon name="plus" size={13} /> Add provider
        </button>
      </div>
      <div style={{ border: `1px solid ${T.border}`, borderRadius: 12, background: T.card, overflow: 'hidden' }}>
        {PROVIDERS.map((p, i) => (
          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 18px', borderTop: i === 0 ? 'none' : `1px solid ${T.border}` }}>
            <Icon name={p.local ? 'shield' : 'key'} size={15} style={{ color: p.local ? T.primary : T.mutedFg }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: T.fg }}>{p.name}</div>
              <div className="mono" style={{ fontSize: 11, color: T.mutedFg, marginTop: 2 }}>{p.local ? 'No key needed · runs locally' : p.key}</div>
            </div>
            <span style={{ fontSize: 11.5, color: T.mutedFg }}>{p.models} model{p.models > 1 ? 's' : ''}</span>
            {!p.local && <button style={{ background: 'none', border: 'none', color: T.mutedFg, padding: 4, cursor: 'pointer' }}><Icon name="trash" size={14} /></button>}
          </div>
        ))}
      </div>
    </section>
  );
}

// ---- state seeds ----
const STATE_SEED = {
  fresh:       { voice: null, downloading: null, cleanup: false, picker: 'voice' },
  cloud:       { voice: 'groq/whisper-large-v3-turbo', downloading: null, cleanup: true, picker: null },
  downloading: { voice: 'groq/whisper-large-v3-turbo', downloading: 'local-whisper/small.en', cleanup: true, picker: 'voice' },
  local:       { voice: 'local-whisper/base.en', downloading: null, cleanup: false, picker: null },
};

function ModelsPage({ state, variant }) {
  const seed = STATE_SEED[state] || STATE_SEED.cloud;
  const [voiceId, setVoiceId] = React.useState(seed.voice);
  const [downloadingId, setDownloadingId] = React.useState(seed.downloading);
  const [cleanup, setCleanup] = React.useState(seed.cleanup);
  const [picker, setPicker] = React.useState(seed.picker);

  React.useEffect(() => {
    setVoiceId(seed.voice); setDownloadingId(seed.downloading); setCleanup(seed.cleanup); setPicker(seed.picker);
  }, [state]);

  const voice = ALL_VOICE.find((m) => m.id === voiceId);
  const llm = LLM_CLEANUP.find((m) => m.id === 'groq/llama-3.3-70b');

  const offline = voice?.kind === 'local';

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '44px 40px 80px' }}>
      {/* header */}
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 className="serif" style={{ margin: 0, fontSize: 48, fontWeight: 400, lineHeight: 0.95, letterSpacing: '-0.025em', color: T.fg }}>
            <span className="serif-italic" style={{ color: T.primary }}>Models</span><span>.</span>
          </h1>
          <p style={{ margin: '10px 0 0', maxWidth: 480, fontSize: 14, lineHeight: 1.5, color: T.mutedFg }}>
            Choose how Freestyle listens — on-device for privacy, or cloud for speed and reach. Add an optional model to clean up what you say.
          </p>
        </div>
        {offline && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: 999, background: T.accent, whiteSpace: 'nowrap' }}>
            <Icon name="wifiOff" size={13} style={{ color: T.accentFg }} />
            <span className="mono" style={{ fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.accentFg }}>Offline ready</span>
          </div>
        )}
      </div>

      <PairCard
        voice={voice} llm={llm} cleanup={cleanup} pickerOpen={picker}
        onToggleCleanup={setCleanup}
        onChangeVoice={() => setPicker(picker === 'voice' ? null : 'voice')}
        onChangeLlm={() => { setCleanup(true); setPicker(picker === 'llm' ? null : 'llm'); }}
      />

      {picker === 'voice' && (
        <div style={{ marginTop: 16 }}>
          <Picker variant={variant} selectedId={voiceId} downloadingId={downloadingId}
            onClose={() => setPicker(null)}
            onSelect={(m) => { setVoiceId(m.id); setPicker(null); }}
            onDownload={(id) => setDownloadingId(id)} />
        </div>
      )}

      <ProvidersSection onAdd={() => setPicker('voice')} />
    </div>
  );
}

Object.assign(window, { ModelsPage });
