// Models page redesign — the voice picker (the centerpiece of the redesign).
// Three ways to choose across on-device + cloud, switchable via Tweaks:
//   unified  · one list, filter chips
//   segmented· On-device / Cloud tabs
//   guided   · "what matters most?" → recommended

function Meter({ value, color }) {
  return (
    <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} style={{
          width: 5, height: 5, borderRadius: '50%',
          background: i <= value ? (color || T.primary) : T.border,
        }} />
      ))}
    </span>
  );
}

function ProvBadge({ kind }) {
  const local = kind === 'local';
  return (
    <span className="mono" style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 999,
      fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap',
      background: local ? T.accent : T.secondary,
      color: local ? T.accentFg : T.mutedFg,
      border: `1px solid ${local ? 'transparent' : T.border}`,
    }}>
      <Icon name={local ? 'shield' : 'cloud'} size={11} />
      {local ? 'On-device' : 'Cloud'}
    </span>
  );
}

function StatPair({ icon, label, color }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: T.mutedFg, fontSize: 11.5, whiteSpace: 'nowrap' }}>
      <Icon name={icon} size={12} style={{ color: color || T.mutedFg }} />
      {label}
    </span>
  );
}

function VoiceRow({ m, selected, downloading, onSelect, onDownload, first }) {
  const local = m.kind === 'local';
  const ready = local ? (downloading ? false : m.status === 'ready') : m.hasKey;
  const needsDownload = local && m.status !== 'ready' && !downloading;
  const needsKey = !local && !m.hasKey;

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr auto', gap: 14, alignItems: 'center',
      padding: '15px 18px', borderTop: first ? 'none' : `1px solid ${T.border}`,
      background: selected ? 'rgba(107,143,18,0.06)' : 'transparent',
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 14, fontWeight: 600, color: T.fg, whiteSpace: 'nowrap' }}>{m.name}</span>
          <span style={{ fontSize: 12, color: T.mutedFg, whiteSpace: 'nowrap' }}>{m.provider}</span>
          {m.quantized && (
            <span className="mono" style={{ padding: '1px 6px', borderRadius: 999, background: 'rgba(107,143,18,0.12)', color: T.primary, fontSize: 8.5, letterSpacing: '0.08em' }}>FASTER</span>
          )}
          {selected && <Icon name="check" size={15} style={{ color: T.primary }} />}
        </div>

        {/* stat strip */}
        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 9, flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="zap" size={12} style={{ color: T.mutedFg }} /><Meter value={m.speed} />
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="target" size={12} style={{ color: T.mutedFg }} /><Meter value={m.quality} />
          </span>
          {local
            ? <React.Fragment>
                <StatPair icon="download" label={fmtBytes(m.size)} />
                <StatPair icon="cpu" label={`${m.ram} RAM`} />
              </React.Fragment>
            : <React.Fragment>
                <StatPair icon="coin" label={`$${m.cost.toFixed(2)}/hr`} />
                {m.streaming && <StatPair icon="wifi" label="Streaming" color={T.primary} />}
              </React.Fragment>}
        </div>

        {/* download progress */}
        {downloading && (
          <div style={{ marginTop: 10 }}>
            <div style={{ height: 5, borderRadius: 999, background: T.secondary, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: '62%', background: T.primary, borderRadius: 999 }} />
            </div>
            <div className="mono" style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 10, color: T.mutedFg }}>
              <span>{fmtBytes(m.size * 0.62)} / {fmtBytes(m.size)}</span>
              <span>4.2 MB/s · 62%</span>
            </div>
          </div>
        )}
      </div>

      {/* action */}
      <div style={{ justifySelf: 'end' }}>
        {selected ? (
          <span className="mono" style={{ fontSize: 10, letterSpacing: '0.14em', color: T.primary }}>SELECTED</span>
        ) : needsDownload ? (
          <button onClick={() => onDownload(m.id)} style={btn('ghost')}>
            <Icon name="download" size={13} /> {fmtBytes(m.size)}
          </button>
        ) : downloading ? (
          <button style={btn('ghost')}><Icon name="x" size={12} /> Cancel</button>
        ) : needsKey ? (
          <button onClick={() => onSelect(m)} style={btn('ghost')}>
            <Icon name="key" size={12} /> Add key
          </button>
        ) : (
          <button onClick={() => onSelect(m)} style={btn('solid')}>Use</button>
        )}
      </div>
    </div>
  );
}

// ---- filter chips ----
const FILTERS = [
  { id: 'all', label: 'All', icon: null },
  { id: 'private', label: 'On-device', icon: 'shield' },
  { id: 'cloud', label: 'Cloud', icon: 'cloud' },
  { id: 'fast', label: 'Fastest', icon: 'zap' },
  { id: 'accurate', label: 'Most accurate', icon: 'target' },
];
function applyFilter(list, f) {
  if (f === 'private') return list.filter((m) => m.kind === 'local');
  if (f === 'cloud') return list.filter((m) => m.kind === 'cloud');
  if (f === 'fast') return [...list].filter((m) => m.speed >= 4).sort((a, b) => b.speed - a.speed);
  if (f === 'accurate') return [...list].filter((m) => m.quality >= 4).sort((a, b) => b.quality - a.quality);
  if (f === 'free') return list.filter((m) => m.kind === 'local' || m.cost === 0);
  return list;
}

function PickerShell({ children, onClose, title }) {
  return (
    <section style={{ border: `1px solid ${T.border}`, borderRadius: 14, background: T.card, overflow: 'hidden', boxShadow: '0 24px 50px -34px rgba(20,12,4,0.4)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: `1px solid ${T.border}` }}>
        <Icon name="mic" size={15} style={{ color: T.mutedFg }} />
        <span className="mono" style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: T.fg }}>{title}</span>
        <div style={{ flex: 1 }} />
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.mutedFg, display: 'flex', padding: 4 }}><Icon name="x" size={16} /></button>
      </header>
      {children}
    </section>
  );
}

function PickerSectionHeader({ icon, label, note }) {
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', alignItems: 'center', gap: 8, padding: '10px 18px', background: T.card, borderBottom: `1px solid ${T.border}`, whiteSpace: 'nowrap' }}>
      <Icon name={icon} size={12} style={{ color: icon === 'shield' ? T.primary : T.mutedFg }} />
      <span className="mono" style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: T.fg, whiteSpace: 'nowrap' }}>{label}</span>
      {note && <span style={{ fontSize: 11.5, color: T.mutedFg, whiteSpace: 'nowrap' }}>{note}</span>}
    </div>
  );
}

function UnifiedPicker(p) {
  const [filter, setFilter] = React.useState('all');
  const list = applyFilter(ALL_VOICE, filter);
  const localList = list.filter((m) => m.kind === 'local');
  const cloudList = list.filter((m) => m.kind === 'cloud');
  const row = (m, i) => <VoiceRow key={m.id} m={m} first={i === 0} selected={p.selectedId === m.id} downloading={p.downloadingId === m.id} onSelect={p.onSelect} onDownload={p.onDownload} />;
  return (
    <PickerShell title="Choose a voice model" onClose={p.onClose}>
      <div style={{ display: 'flex', gap: 8, padding: '13px 18px', borderBottom: `1px solid ${T.border}`, flexWrap: 'wrap', alignItems: 'center' }}>
        {FILTERS.map((f) => {
          const on = filter === f.id;
          return (
            <button key={f.id} onClick={() => setFilter(f.id)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999,
              border: `1px solid ${on ? T.primary : T.border}`, background: on ? T.primary : 'transparent',
              color: on ? T.primaryFg : T.mutedFg, fontSize: 12, fontWeight: 500, fontFamily: 'inherit',
            }}>
              {f.icon && <Icon name={f.icon} size={12} />}{f.label}
            </button>
          );
        })}
      </div>
      <div style={{ maxHeight: 384, overflowY: 'auto' }}>
        {list.map((m, i) => row(m, i))}
      </div>
    </PickerShell>
  );
}

function SegmentedPicker(p) {
  const [tab, setTab] = React.useState('local');
  const list = tab === 'local' ? LOCAL_VOICE : CLOUD_VOICE;
  return (
    <PickerShell title="Choose a voice model" onClose={p.onClose}>
      <div style={{ display: 'flex', gap: 4, padding: 6, margin: '14px 18px 0', background: T.secondary, borderRadius: 10 }}>
        {[['local', 'shield', 'On-device'], ['cloud', 'cloud', 'Cloud']].map(([id, ic, label]) => {
          const on = tab === id;
          return (
            <button key={id} onClick={() => setTab(id)} style={{
              flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              padding: '9px 0', borderRadius: 7, border: 'none', fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
              background: on ? T.card : 'transparent', color: on ? T.fg : T.mutedFg,
              boxShadow: on ? '0 1px 3px rgba(20,12,4,0.1)' : 'none',
            }}>
              <Icon name={ic} size={14} style={{ color: on ? (id === 'local' ? T.primary : T.mutedFg) : T.mutedFg }} />{label}
            </button>
          );
        })}
      </div>
      <div style={{ padding: '12px 18px 4px', fontSize: 12, color: T.mutedFg }}>
        {tab === 'local'
          ? 'Runs on your machine with whisper.cpp. Private, offline, no usage cost — pick a size for your hardware.'
          : 'Hosted transcription. Fastest setup and top accuracy — audio is sent to the provider.'}
      </div>
      <div style={{ maxHeight: 360, overflowY: 'auto' }}>
        {list.map((m, i) => <VoiceRow key={m.id} m={m} first={i === 0} selected={p.selectedId === m.id} downloading={p.downloadingId === m.id} onSelect={p.onSelect} onDownload={p.onDownload} />)}
      </div>
    </PickerShell>
  );
}

const PRIORITIES = [
  { id: 'privacy', icon: 'shield', title: 'Privacy', desc: 'Keep audio on my device', pick: 'local-whisper/base.en' },
  { id: 'speed', icon: 'zap', title: 'Speed', desc: 'Type as fast as I talk', pick: 'groq/whisper-large-v3-turbo' },
  { id: 'accuracy', icon: 'target', title: 'Accuracy', desc: 'Get every word right', pick: 'openai/gpt-4o-transcribe' },
  { id: 'cost', icon: 'coin', title: 'Low cost', desc: 'Avoid per-minute fees', pick: 'local-whisper/base.en' },
];
function GuidedPicker(p) {
  const [pri, setPri] = React.useState(null);
  const rec = pri ? ALL_VOICE.find((m) => m.id === PRIORITIES.find((x) => x.id === pri).pick) : null;
  const rest = pri ? ALL_VOICE.filter((m) => m.id !== rec.id) : [];
  return (
    <PickerShell title="Find your voice model" onClose={p.onClose}>
      <div style={{ padding: 18 }}>
        <div className="mono" style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: T.mutedFg, marginBottom: 12 }}>What matters most to you?</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
          {PRIORITIES.map((x) => {
            const on = pri === x.id;
            return (
              <button key={x.id} onClick={() => setPri(x.id)} style={{
                textAlign: 'left', padding: '14px 13px', borderRadius: 11, fontFamily: 'inherit', cursor: 'pointer',
                border: `1px solid ${on ? T.primary : T.border}`, background: on ? 'rgba(107,143,18,0.07)' : T.card,
              }}>
                <Icon name={x.icon} size={17} style={{ color: on ? T.primary : T.mutedFg }} />
                <div style={{ fontSize: 13.5, fontWeight: 600, color: T.fg, marginTop: 9 }}>{x.title}</div>
                <div style={{ fontSize: 11, color: T.mutedFg, marginTop: 3, lineHeight: 1.35 }}>{x.desc}</div>
              </button>
            );
          })}
        </div>
      </div>
      {rec && (
        <div style={{ borderTop: `1px solid ${T.border}` }}>
          <div style={{ padding: '11px 18px', display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(107,143,18,0.06)' }}>
            <Icon name="sparkles" size={13} style={{ color: T.primary }} />
            <span className="mono" style={{ fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: T.primary }}>Recommended for you</span>
          </div>
          <VoiceRow m={rec} first selected={p.selectedId === rec.id} downloading={p.downloadingId === rec.id} onSelect={p.onSelect} onDownload={p.onDownload} />
          <details style={{ borderTop: `1px solid ${T.border}` }}>
            <summary className="mono" style={{ listStyle: 'none', cursor: 'pointer', padding: '12px 18px', fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: T.mutedFg }}>See all {rest.length} other models →</summary>
            <div style={{ maxHeight: 280, overflowY: 'auto', borderTop: `1px solid ${T.border}` }}>
              {rest.map((m, i) => <VoiceRow key={m.id} m={m} first={i === 0} selected={p.selectedId === m.id} downloading={p.downloadingId === m.id} onSelect={p.onSelect} onDownload={p.onDownload} />)}
            </div>
          </details>
        </div>
      )}
    </PickerShell>
  );
}

function Picker({ variant, ...p }) {
  if (variant === 'segmented') return <SegmentedPicker {...p} />;
  if (variant === 'guided') return <GuidedPicker {...p} />;
  return <UnifiedPicker {...p} />;
}

// shared button styles
function btn(kind) {
  const base = { display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap' };
  if (kind === 'solid') return { ...base, background: T.fg, color: T.bg, border: '1px solid transparent' };
  return { ...base, background: 'transparent', color: T.fg, border: `1px solid ${T.border}` };
}

Object.assign(window, { Picker, VoiceRow, Meter, btn });
