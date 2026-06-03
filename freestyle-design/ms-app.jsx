// Models page redesign — desktop app frame + sidebar + Tweaks + annotations.

const WIN_W = 1140, WIN_H = 800;

const NAV = [
  { group: null, items: [['Today', 'mic'], ['History', 'refresh'], ['Dictionary', 'sparkles'], ['Formats', 'target']] },
];

function Sidebar() {
  return (
    <div style={{ width: 224, flexShrink: 0, background: T.secondary, borderRight: `1px solid ${T.border}`, padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 10px 16px' }}>
        <svg viewBox="0 0 100 100" width="20" height="20"><polyline points="8,52 22,46 33,62 46,30 58,66 70,40 82,54 92,49" fill="none" stroke={T.primary} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <span className="serif-italic" style={{ fontSize: 20, color: T.fg }}>freestyle<span style={{ color: T.primary }}>.</span></span>
      </div>
      {NAV[0].items.map(([label, ic]) => (
        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 11px', borderRadius: 8, fontSize: 13.5, color: T.mutedFg }}>
          <Icon name={ic} size={15} style={{ opacity: 0.8 }} />{label}
        </div>
      ))}
      <div className="mono" style={{ fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: T.mutedFg, padding: '18px 11px 6px', opacity: 0.7 }}>Settings</div>
      {[['General', 'cpu'], ['Models', 'mic'], ['Shortcuts', 'zap']].map(([label, ic]) => {
        const active = label === 'Models';
        return (
          <div key={label} style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 11px', borderRadius: 8, fontSize: 13.5,
            background: active ? T.card : 'transparent', color: active ? T.fg : T.mutedFg,
            fontWeight: active ? 600 : 400, boxShadow: active ? '0 1px 2px rgba(20,12,4,0.06)' : 'none',
          }}>
            <Icon name={ic} size={15} style={{ color: active ? T.primary : T.mutedFg, opacity: active ? 1 : 0.8 }} />{label}
          </div>
        );
      })}
    </div>
  );
}

function Window({ state, variant }) {
  return (
    <div style={{ width: WIN_W, height: WIN_H, borderRadius: 14, overflow: 'hidden', background: T.bg, border: `1px solid ${T.border}`, boxShadow: '0 50px 100px -40px rgba(20,12,4,0.55)', display: 'flex', flexDirection: 'column' }}>
      {/* titlebar */}
      <div style={{ height: 38, flexShrink: 0, background: T.secondary, borderBottom: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', padding: '0 14px', gap: 8 }}>
        <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#E0805F' }} />
        <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#D9B24A' }} />
        <span style={{ width: 11, height: 11, borderRadius: '50%', background: T.primary }} />
        <span className="mono" style={{ marginLeft: 12, fontSize: 11, color: T.mutedFg, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>Freestyle — Settings</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        <Sidebar />
        <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', background: T.bg }}>
          <ModelsPage state={state} variant={variant} />
        </div>
      </div>
    </div>
  );
}

const NOTES = [
  { n: 1, t: 'Unified choosing', d: 'On-device and cloud models live in one list, not separate sections. The decision happens in one place.' },
  { n: 2, t: 'Compare what matters', d: 'Every row shows speed + accuracy meters, plus size & RAM (local) or $/hr (cloud) — the real trade-off, side by side.' },
  { n: 3, t: 'Privacy is first-class', d: 'On-device models carry a green shield and an explicit "audio never leaves your Mac" line. The hero shows an Offline-ready badge.' },
  { n: 4, t: 'Filter by intent', d: 'Chips (Private · Fastest · Most accurate · No cost) let people choose by goal instead of memorizing providers.' },
  { n: 5, t: 'Download in place', d: 'Local models download from the same row you pick them in — progress, size and RAM inline. No separate management screen.' },
];

function NotesRail() {
  return (
    <div style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="mono" style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(244,240,228,0.6)' }}>Redesign decisions</div>
      {NOTES.map((x) => (
        <div key={x.n} style={{ background: 'rgba(251,248,238,0.97)', borderRadius: 11, padding: '13px 15px', border: `1px solid ${T.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span className="mono" style={{ width: 19, height: 19, borderRadius: '50%', background: T.primary, color: T.primaryFg, fontSize: 11, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{x.n}</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: T.fg }}>{x.t}</span>
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.45, color: T.mutedFg }}>{x.d}</div>
        </div>
      ))}
    </div>
  );
}

function App() {
  const [tw, setTweak] = useTweaks({ variant: 'unified', state: 'fresh', annotations: false });
  const [scale, setScale] = React.useState(1);
  const annotations = tw.annotations;

  React.useEffect(() => {
    const fit = () => {
      const railW = annotations ? 300 + 28 : 0;
      const s = Math.min((window.innerWidth - 64 - railW) / WIN_W, (window.innerHeight - 64) / WIN_H, 1);
      setScale(Math.max(s, 0.25));
    };
    fit(); window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [annotations]);

  return (
    <React.Fragment>
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 28, padding: 32, background: '#2A2620' }}>
        <div style={{ width: WIN_W * scale, height: WIN_H * scale, flexShrink: 0 }}>
          <div style={{ width: WIN_W, height: WIN_H, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
            <Window state={tw.state} variant={tw.variant} />
          </div>
        </div>
        {annotations && <NotesRail />}
      </div>

      <TweaksPanel>
        <TweakSection label="Choosing experience" />
        <TweakRadio label="Picker style" value={tw.variant} options={['unified', 'segmented', 'guided']} onChange={(v) => setTweak('variant', v)} />
        <TweakSection label="Page state" />
        <TweakSelect label="State" value={tw.state}
          options={['fresh', 'cloud', 'downloading', 'local']}
          onChange={(v) => setTweak('state', v)} />
        <TweakSection label="Spec" />
        <TweakToggle label="Annotations" value={tw.annotations} onChange={(v) => setTweak('annotations', v)} />
      </TweaksPanel>
    </React.Fragment>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
