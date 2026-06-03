// Freestyle landing — interactive fn → speak → paste demo.
// One shared state machine (idle → recording → transcribing → typing → done),
// rendered three ways (staging variants). Auto-loops AND responds to holding
// the fn keycap (mouse) or pressing Space while hovering the demo.

// ---- tokens ----
const FT = {
  canvas:   '#F4F0E4', paper: '#ECE7D6', elevated: '#FBF8EE',
  rule:     '#D6CDB8', ruleSoft: '#E3DCC8',
  ink:      '#16140F', inkSoft: '#34302A', mute: '#7B7461',
  dInk:     '#13110C', dCard: '#1B1A14', dText: '#ECE7D6', dMute: '#857C68', dRule: '#2A2820',
};

const ACCENTS = {
  olive: { base: '#6B8F12', deep: '#4A6309', soft: '#E8EFC9', ink: '#2E3F05' },
  blush: { base: '#C9563B', deep: '#9F3E27', soft: '#F6E0D6', ink: '#5A2113' },
  plum:  { base: '#6A5890', deep: '#4C3F6B', soft: '#E8E2F1', ink: '#2E2645' },
};

const DEMO_TEXT = 'Push the meeting to tomorrow at ten — easier on everyone.';

// ============================================================
// State machine
// ============================================================
function useDemoMachine(text, accent) {
  const [phase, setPhase] = React.useState('idle'); // idle|recording|transcribing|typing|done
  const [typed, setTyped] = React.useState('');
  const [elapsed, setElapsed] = React.useState(0);
  const timers = React.useRef([]);
  const manual = React.useRef(false);

  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  const after = (ms, fn) => { const id = setTimeout(fn, ms); timers.current.push(id); };

  const typeOut = React.useCallback((onDone) => {
    setTyped('');
    let i = 0;
    const step = () => {
      i++;
      setTyped(text.slice(0, i));
      if (i < text.length) {
        const ch = text[i - 1];
        const d = ch === ',' ? 150 : (ch === '.' || ch === '—') ? 220 : 26 + Math.random() * 46;
        after(d, step);
      } else if (onDone) after(450, onDone);
    };
    step();
  }, [text]);

  const transcribeThenType = React.useCallback(() => {
    setPhase('transcribing');
    after(820, () => {
      setPhase('typing');
      typeOut(() => setPhase('done'));
    });
  }, [typeOut]);

  const startAuto = React.useCallback(() => {
    clear();
    setPhase('idle'); setTyped('');
    after(1700, () => {
      if (manual.current) return;
      setPhase('recording');
      after(2900, () => { if (!manual.current) transcribeThenType(); });
    });
  }, [transcribeThenType]);

  // loop back to idle after 'done'
  React.useEffect(() => {
    if (phase === 'done' && !manual.current) after(2600, startAuto);
  }, [phase, startAuto]);

  // recording elapsed timer
  React.useEffect(() => {
    if (phase !== 'recording') { setElapsed(0); return; }
    const t0 = performance.now();
    let raf;
    const tick = () => { setElapsed((performance.now() - t0) / 1000); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  // boot
  React.useEffect(() => { startAuto(); return clear; }, []); // eslint-disable-line

  const press = React.useCallback(() => {
    manual.current = true;
    clear();
    setTyped('');
    setPhase('recording');
  }, []);
  const release = React.useCallback(() => {
    if (!manual.current) return;
    manual.current = false;
    clear();
    transcribeThenType();
  }, [transcribeThenType]);

  return { phase, typed, elapsed, press, release };
}

// ============================================================
// Voice wave
// ============================================================
function VoiceWave({ active, accent, width = 340, height = 46, idleColor = FT.mute }) {
  const [pts, setPts] = React.useState('');
  React.useEffect(() => {
    let raf;
    if (!active) {
      const N = 60, out = [];
      for (let i = 0; i <= N; i++) out.push(`${(i / N * width).toFixed(1)},${(height / 2).toFixed(1)}`);
      setPts(out.join(' '));
      return;
    }
    const start = performance.now();
    const animate = () => {
      const t = (performance.now() - start) / 1000;
      const N = 96, out = [];
      const loud = (0.55 + 0.45 * Math.sin(t * 1.3)) * (0.7 + 0.3 * Math.sin(t * 2.4 + 1));
      for (let i = 0; i <= N; i++) {
        const tt = i / N, x = tt * width, env = Math.sin(Math.PI * tt);
        const a = height * 0.44 * loud * env;
        const y = height / 2 +
          a * Math.sin(tt * 9 * Math.PI + t * 5.2) * 0.72 +
          a * Math.sin(tt * 17 * Math.PI - t * 3.1) * 0.26;
        out.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      }
      setPts(out.join(' '));
      raf = requestAnimationFrame(animate);
    };
    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [active, width, height]);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" style={{ display: 'block' }}>
      <polyline points={pts} fill="none"
        stroke={active ? accent.deep : idleColor}
        strokeWidth={active ? 2 : 1.3}
        strokeLinecap="round" strokeLinejoin="round"
        style={{ transition: 'stroke 0.25s ease' }} opacity={active ? 1 : 0.5} />
    </svg>
  );
}

// ============================================================
// fn keycap — hold to record
// ============================================================
function FnKey({ pressed, accent, size = 64, onHoldStart, onHoldEnd, interactive = true }) {
  const w = size * 1.18, h = size * 0.92;
  const handlers = interactive ? {
    onMouseDown: (e) => { e.preventDefault(); onHoldStart && onHoldStart(); },
    onMouseUp: () => onHoldEnd && onHoldEnd(),
    onMouseLeave: () => onHoldEnd && onHoldEnd(),
    onTouchStart: (e) => { e.preventDefault(); onHoldStart && onHoldStart(); },
    onTouchEnd: (e) => { e.preventDefault(); onHoldEnd && onHoldEnd(); },
  } : {};
  return (
    <button {...handlers} aria-label="Hold fn to dictate" style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: w, height: h, padding: 0, borderRadius: size * 0.2,
      background: pressed ? accent.soft : FT.elevated,
      border: `1.5px solid ${pressed ? accent.base : FT.rule}`,
      borderBottomWidth: pressed ? 1.5 : Math.max(3, size * 0.085),
      color: pressed ? accent.ink : FT.ink,
      fontFamily: "'JetBrains Mono', monospace", fontSize: size * 0.34, fontWeight: 600,
      letterSpacing: '0.02em', cursor: interactive ? 'pointer' : 'default',
      transform: pressed ? `translateY(${size * 0.05}px)` : 'translateY(0)',
      boxShadow: pressed
        ? `inset 0 -1px 0 rgba(20,12,4,0.06), 0 0 0 7px ${accent.soft}66`
        : `0 1px 0 ${FT.rule}, 0 3px 5px -2px rgba(20,12,4,0.10)`,
      transition: 'all 0.16s cubic-bezier(0.3,0.7,0.4,1)',
      WebkitUserSelect: 'none', userSelect: 'none',
    }}>fn</button>
  );
}

// ============================================================
// Status chip — small label that reads the phase
// ============================================================
function StatusChip({ phase, elapsed, accent }) {
  const map = {
    idle:         { dot: FT.mute,    label: 'Ready' },
    recording:    { dot: accent.base, label: `Listening · 0:0${Math.min(9, Math.floor(elapsed))}` },
    transcribing: { dot: accent.base, label: 'Transcribing' },
    typing:       { dot: accent.base, label: 'Pasting to Notes' },
    done:         { dot: accent.deep, label: 'Pasted · 11 words' },
  };
  const s = map[phase] || map.idle;
  const live = phase === 'recording';
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%', background: s.dot,
        opacity: phase === 'idle' ? 0.45 : 1,
        animation: live ? 'fsDot 1.5s infinite ease-in-out' : 'none',
      }} />
      <span className="mono" style={{
        fontSize: 11, letterSpacing: '0.15em', textTransform: 'uppercase', fontWeight: 600,
        color: phase === 'idle' ? FT.mute : (phase === 'done' ? accent.deep : accent.ink),
      }}>{s.label}</span>
      <style>{`@keyframes fsDot{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.45);opacity:.5}}`}</style>
    </div>
  );
}

// ============================================================
// Notes editor window
// ============================================================
function Caret({ color, blink }) {
  return (
    <span style={{
      display: 'inline-block', width: 2, height: '1.05em', verticalAlign: '-0.18em',
      background: color, marginLeft: 1, borderRadius: 1,
      animation: blink ? 'fsCaret 1.05s steps(1) infinite' : 'none',
    }}>
      <style>{`@keyframes fsCaret{0%,49%{opacity:1}50%,100%{opacity:0}}`}</style>
    </span>
  );
}

function NotesEditor({ typed, phase, accent, compact = false }) {
  const showCaret = phase === 'typing' || phase === 'done' || phase === 'idle' || phase === 'recording';
  const blink = phase === 'idle' || phase === 'recording' || phase === 'done';
  const empty = typed.length === 0;
  return (
    <div style={{
      background: FT.elevated, border: `1px solid ${FT.rule}`, borderRadius: 14,
      boxShadow: '0 24px 60px -28px rgba(20,12,4,0.35), 0 2px 0 rgba(255,255,255,0.5) inset',
      overflow: 'hidden', display: 'flex', flexDirection: 'column', width: '100%',
    }}>
      {/* titlebar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', height: 38,
        borderBottom: `1px solid ${FT.ruleSoft}`, background: FT.paper, position: 'relative',
      }}>
        <span style={{ display: 'flex', gap: 7 }}>
          {['#E0A89B', '#E6D08A', '#A9C77E'].map((c, i) => (
            <span key={i} style={{ width: 11, height: 11, borderRadius: '50%', background: c, border: '0.5px solid rgba(0,0,0,0.08)' }} />
          ))}
        </span>
        <span className="mono" style={{
          position: 'absolute', left: 0, right: 0, textAlign: 'center',
          fontSize: 11.5, color: FT.mute, letterSpacing: '0.04em',
        }}>Untitled — Notes</span>
      </div>
      {/* body */}
      <div style={{ padding: compact ? '22px 24px' : '32px 34px', minHeight: compact ? 150 : 200, position: 'relative', flex: 1 }}>
        <div className="mono" style={{ fontSize: 10.5, color: FT.mute, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 16 }}>
          Today · 11:42 pm
        </div>
        <p style={{
          margin: 0, fontFamily: "'DM Sans', sans-serif",
          fontSize: compact ? 18 : 21, lineHeight: 1.6, color: FT.ink, fontWeight: 400,
          textWrap: 'pretty', minHeight: '1.6em',
        }}>
          {empty && phase !== 'typing' ? (
            <span style={{ color: FT.mute, opacity: 0.55 }}>
              {showCaret && <Caret color={accent.base} blink={blink} />}
              <span style={{ marginLeft: 4, fontStyle: 'italic' }}>Your words land here.</span>
            </span>
          ) : (
            <span>
              {typed}
              {showCaret && <Caret color={accent.base} blink={phase === 'done' || phase === 'idle'} />}
            </span>
          )}
        </p>
      </div>
    </div>
  );
}

// ============================================================
// Floating pill (cream, brand-matched)
// ============================================================
function PillBars({ accent, count = 12, width = 56, height = 14 }) {
  const hs = React.useMemo(() => Array.from({ length: count }, (_, i) => {
    const s = Math.sin((i + 1) * 12.9898) * 43758.5453; const r = s - Math.floor(s);
    const env = 1 - Math.abs((i / (count - 1)) - 0.5) * 1.3;
    return Math.max(0.25, Math.min(1, (0.4 + r * 0.6) * env));
  }), [count]);
  const barW = Math.max(2, (width - (count - 1) * 2) / count);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, width, height }}>
      {hs.map((h, i) => (
        <span key={i} style={{
          width: barW, height: `${h * 100}%`, background: accent.deep, borderRadius: 999,
          animation: `fsBar .9s ${(i % 7) * 0.08}s infinite ease-in-out alternate`,
        }} />
      ))}
      <style>{`@keyframes fsBar{0%{transform:scaleY(.4)}100%{transform:scaleY(1.05)}}`}</style>
    </span>
  );
}

function FloatingPill({ phase, elapsed, accent, size = 34 }) {
  const fz = Math.round(size * 0.32);
  const base = {
    height: size, padding: `0 ${Math.round(size * 0.4)}px`, borderRadius: size / 2,
    background: FT.elevated, border: `1px solid ${FT.rule}`,
    boxShadow: `0 ${Math.round(size * 0.34)}px ${Math.round(size * 0.85)}px -8px rgba(20,12,4,0.45)`,
    display: 'inline-flex', alignItems: 'center', gap: Math.round(size * 0.28),
    fontFamily: "'DM Sans', sans-serif", fontSize: fz, fontWeight: 500, color: FT.ink,
  };
  const dot = Math.max(7, Math.round(size * 0.17));
  let body;
  if (phase === 'idle') body = (
    <>
      <span style={{ color: accent.base, display: 'inline-flex' }}>{waveGlyph(accent.base, Math.round(size * 0.46))}</span>
      <span style={{ color: FT.mute }}>Hold</span>
      <span className="mono" style={{ padding: '2px 7px', background: FT.paper, border: `1px solid ${FT.ruleSoft}`, borderRadius: 6, fontSize: fz - 2, letterSpacing: '0.03em' }}>fn</span>
    </>
  );
  else if (phase === 'recording') body = (
    <>
      <span style={{ width: dot, height: dot, borderRadius: '50%', background: accent.base, animation: 'fsDot 1.5s infinite ease-in-out' }} />
      <PillBars accent={accent} count={14} width={Math.round(size * 1.7)} height={Math.round(size * 0.42)} />
      <span className="mono" style={{ fontSize: fz - 1, color: FT.mute }}>0:0{Math.min(9, Math.floor(elapsed))}</span>
    </>
  );
  else if (phase === 'transcribing') body = (
    <>
      <span style={{ display: 'inline-flex', gap: 3 }}>
        {[0, 1, 2].map(i => <span key={i} style={{ width: Math.round(size * 0.09), height: Math.round(size * 0.09), borderRadius: '50%', background: accent.base, animation: `fsSpin 1s ${i * 0.15}s infinite ease-in-out` }} />)}
      </span>
      <span>Transcribing…</span>
      <style>{`@keyframes fsSpin{0%,100%{opacity:.25;transform:translateY(0)}50%{opacity:1;transform:translateY(-2px)}}`}</style>
    </>
  );
  else body = (
    <>
      <span style={{ color: accent.deep, display: 'inline-flex' }}>{checkGlyph(accent.deep, Math.round(size * 0.4))}</span>
      <span style={{ color: FT.mute }}>Pasted to Notes</span>
    </>
  );
  return <div style={base}>{body}</div>;
}

function waveGlyph(color, size = 15) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true">
      <polyline points="6,50 18,50 30,28 42,72 54,38 66,62 78,46 94,50" fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function checkGlyph(color, size = 13) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none"><path d="M20 6L9 17l-5-5" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

Object.assign(window, {
  FT, ACCENTS, DEMO_TEXT, useDemoMachine, VoiceWave, FnKey, StatusChip,
  NotesEditor, FloatingPill, Caret, waveGlyph, checkGlyph, PillBars,
});
