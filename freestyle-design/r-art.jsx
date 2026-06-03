// Freestyle — App redesign: shared tokens, helpers, window chrome, wave.

const R = {
  CANVAS:    '#F4F0E4',
  PAPER:     '#ECE7D6',
  ELEVATED:  '#FBF8EE',
  RULE:      '#D6CDB8',
  RULE_SOFT: '#E3DCC8',
  INK:       '#16140F',
  INK_SOFT:  '#34302A',
  MUTE:      '#7B7461',
  OLIVE:     '#6B8F12',
  OLIVE_DEEP:'#4A6309',
  OLIVE_INK: '#2E3F05',
  OLIVE_SOFT:'#E8EFC9',
  BLUSH:     '#DD6E4E',
  PLUM:      '#5E4E78',
  // dark — for the pill which floats over any desktop
  D_INK:     '#0F0E0B',
  D_CARD:    '#1B1A14',
  D_ELEV:    '#252319',
  D_TEXT:    '#ECE7D6',
  D_MUTE:    '#7C7561',
  D_RULE:    '#2A2820',
};

// ============================================================
// WAVE LOGO — generates a polyline string from the crescendo curve
// ============================================================
function wavePoints({ N = 80, xStart = 8, xWidth = 84, centerY = 50, peakAmp = 35, cycles = 2.5 } = {}) {
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = xStart + t * xWidth;
    const amp = peakAmp * t; // linear crescendo
    const y = centerY - amp * Math.sin(2 * Math.PI * cycles * t);
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return pts.join(' ');
}

const WAVE_PTS = wavePoints();

function Wave({ size = 64, color = R.OLIVE, weight, height }) {
  const s = size;
  const h = height || s;
  const w = weight || s * 0.09;
  return (
    <svg width={s} height={h} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" style={{ overflow:'visible', display:'block' }}>
      <polyline
        points={WAVE_PTS}
        fill="none" stroke={color}
        strokeWidth={w * (100 / s)}
        strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

// Inline wordmark
function Wordmark({ size = 22, color, accent }) {
  const c = color || R.INK;
  const a = accent || R.OLIVE;
  return (
    <span className="serif-italic" style={{
      fontSize: size, color: c, lineHeight: 0.9, letterSpacing: '-0.015em',
      display: 'inline-flex', alignItems: 'baseline',
    }}>
      freestyle<span style={{ color: a, marginLeft: -size * 0.06 }}>.</span>
    </span>
  );
}

// Brand lockup (wave + wordmark, side-by-side)
function Brand({ size = 22, color, accent }) {
  const c = color || R.INK;
  const a = accent || R.OLIVE;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap: size * 0.45 }}>
      <Wave size={size * 1.3} color={a} />
      <Wordmark size={size} color={c} accent={a} />
    </span>
  );
}

// ============================================================
// macOS window chrome
// ============================================================
function MacWindow({ width=1200, height=780, title='', children, bg=R.CANVAS, real = true }) {
  return (
    <div style={{
      width, height, background: bg, borderRadius: 12, overflow: 'hidden',
      boxShadow: '0 24px 60px -20px rgba(20,12,4,0.18), 0 0 0 1px rgba(20,12,4,0.05)',
      display: 'flex', flexDirection: 'column',
      border: `1px solid ${R.RULE}`,
    }}>
      <div style={{
        height: 34, background: bg === R.CANVAS ? R.PAPER : 'rgba(255,255,255,0.04)',
        display: 'flex', alignItems: 'center',
        padding: '0 14px', gap: 8,
        borderBottom: bg === R.CANVAS ? `1px solid ${R.RULE}` : `1px solid ${R.D_RULE}`,
      }}>
        {real ? (
          <>
            <span style={{ width:12, height:12, borderRadius:'50%', background:'#FF5F57' }} />
            <span style={{ width:12, height:12, borderRadius:'50%', background:'#FEBC2E' }} />
            <span style={{ width:12, height:12, borderRadius:'50%', background:'#28C840' }} />
          </>
        ) : (
          <>
            <span style={{ width:11, height:11, borderRadius:'50%', background:'#3A3640' }} />
            <span style={{ width:11, height:11, borderRadius:'50%', background:'#3A3640' }} />
            <span style={{ width:11, height:11, borderRadius:'50%', background:'#3A3640' }} />
          </>
        )}
        <div style={{
          flex: 1, textAlign:'center',
          fontSize: 11.5, color: bg === R.CANVAS ? R.MUTE : R.D_MUTE,
          letterSpacing: '0.04em',
        }}></div>
        <div style={{ width: 52 }} />
      </div>
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>{children}</div>
    </div>
  );
}

// ============================================================
// Eyebrow label (mono uppercase + olive dot)
// ============================================================
function Eyebrow({ text, accent, color, dot = true }) {
  const a = accent || R.OLIVE;
  const c = color || R.MUTE;
  return (
    <div style={{ display:'inline-flex', alignItems:'center', gap: 10 }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: '50%', background: a }} />}
      <span className="mono" style={{
        fontSize: 11, letterSpacing: '0.18em', textTransform:'uppercase', color: c,
      }}>{text}</span>
    </div>
  );
}

// ============================================================
// Generic key cap (for hotkey display)
// ============================================================
function Kbd({ children, dark = false, big = false }) {
  return (
    <span className="mono" style={{
      display:'inline-flex', alignItems:'center', justifyContent:'center',
      minWidth: big ? 32 : 24, height: big ? 28 : 22, padding: `0 ${big ? 9 : 6}px`,
      background: dark ? 'rgba(255,255,255,0.06)' : R.CANVAS,
      border: dark ? `1px solid ${R.D_RULE}` : `1px solid ${R.RULE}`,
      borderBottomWidth: 2,
      borderRadius: 6,
      fontSize: big ? 12 : 11, color: dark ? R.D_TEXT : R.INK, fontWeight: 500,
    }}>{children}</span>
  );
}

// ============================================================
// Small icons (Lucide-ish, drawn inline so we don't need a lib)
// ============================================================
const I = {
  sliders: (p) => <svg {...iconProps(p)}><path d="M3 6h11M19 6h2M3 12h7M15 12h6M3 18h13M19 18h2"/><circle cx="17" cy="6" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="17.5" cy="18" r="2"/></svg>,
  cpu:     (p) => <svg {...iconProps(p)}><rect x="6" y="6" width="12" height="12" rx="1.5"/><rect x="9" y="9" width="6" height="6" rx="0.5"/><path d="M9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3"/></svg>,
  book:    (p) => <svg {...iconProps(p)}><path d="M4 4h6a2 2 0 0 1 2 2v15a1.5 1.5 0 0 0-1.5-1.5H4V4z"/><path d="M20 4h-6a2 2 0 0 0-2 2v15a1.5 1.5 0 0 1 1.5-1.5H20V4z"/></svg>,
  fileText:(p) => <svg {...iconProps(p)}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h8M8 9h2"/></svg>,
  clock:   (p) => <svg {...iconProps(p)}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>,
  message: (p) => <svg {...iconProps(p)}><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>,
  mic:     (p) => <svg {...iconProps(p)}><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>,
  key:     (p) => <svg {...iconProps(p)}><circle cx="7.5" cy="15.5" r="3.5"/><path d="M10 13l9-9 3 3-3 3-2-2-2 2-2-2"/></svg>,
  search:  (p) => <svg {...iconProps(p)}><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.35-4.35"/></svg>,
  plus:    (p) => <svg {...iconProps(p)}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  check:   (p) => <svg {...iconProps(p)}><path d="M20 6L9 17l-5-5"/></svg>,
  chevD:   (p) => <svg {...iconProps(p)}><polyline points="6 9 12 15 18 9"/></svg>,
  chevR:   (p) => <svg {...iconProps(p)}><polyline points="9 18 15 12 9 6"/></svg>,
  sun:     (p) => <svg {...iconProps(p)}><circle cx="12" cy="12" r="4"/><line x1="12" y1="2" x2="12" y2="4"/><line x1="12" y1="20" x2="12" y2="22"/><line x1="4" y1="12" x2="2" y2="12"/><line x1="22" y1="12" x2="20" y2="12"/><line x1="6.34" y1="6.34" x2="4.93" y2="4.93"/><line x1="19.07" y1="19.07" x2="17.66" y2="17.66"/><line x1="6.34" y1="17.66" x2="4.93" y2="19.07"/><line x1="19.07" y1="4.93" x2="17.66" y2="6.34"/></svg>,
  moon:    (p) => <svg {...iconProps(p)}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>,
  monitor: (p) => <svg {...iconProps(p)}><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>,
  trash:   (p) => <svg {...iconProps(p)}><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg>,
  edit:    (p) => <svg {...iconProps(p)}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
  copy:    (p) => <svg {...iconProps(p)}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  arrowR:  (p) => <svg {...iconProps(p)}><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,
  shield:  (p) => <svg {...iconProps(p)}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>,
  keyboard:(p) => <svg {...iconProps(p)}><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M7 13h10M6 17h.01M10 17h.01M14 17h.01M18 17h.01"/></svg>,
  languages:(p) => <svg {...iconProps(p)}><path d="M5 8h12M9 5v3a7 7 0 0 1-7 7M12 8a7 7 0 0 0 7 7M21 21l-5-10-5 10M14 17h4"/></svg>,
  download:(p) => <svg {...iconProps(p)}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  upload:  (p) => <svg {...iconProps(p)}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  send:    (p) => <svg {...iconProps(p)}><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  sparkle: (p) => <svg {...iconProps(p)}><path d="M12 3l2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3z"/></svg>,
  warning: (p) => <svg {...iconProps(p)}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12" y2="17"/></svg>,
};
function iconProps({ size = 14, color = 'currentColor', strokeWidth = 1.6 } = {}) {
  return {
    width: size, height: size, viewBox: '0 0 24 24',
    fill: 'none', stroke: color, strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round',
  };
}

// ============================================================
// Section title for use inside artboards
// ============================================================
function ArtTitle({ kicker, title, desc }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <Eyebrow text={kicker} />
      <h1 style={{
        margin: '8px 0 4px', fontSize: 28, lineHeight: 1.1, letterSpacing:'-0.02em',
        color: R.INK, fontWeight: 600,
      }}>{title}</h1>
      {desc && <p style={{ margin: 0, fontSize: 13.5, color: R.MUTE, maxWidth: 580 }}>{desc}</p>}
    </div>
  );
}

Object.assign(window, {
  R, WAVE_PTS, wavePoints, Wave, Wordmark, Brand,
  MacWindow, Eyebrow, Kbd, I, ArtTitle,
});
