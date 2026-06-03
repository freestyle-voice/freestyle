// Freestyle — Daily art primitives (light mode). Same shapes as v2 but
// retuned for a paper background: glow is softer, lines are darker, and
// most marks default to the deep readable chartreuse rather than the vivid
// one. The vivid lime is reserved for fills (REC chips, the slash glyph).

const V3 = {
  CANVAS:    '#F4F0E4',
  PAPER:     '#ECE7D6',
  ELEVATED:  '#FBF8EE',
  RULE:      '#D6CDB8',
  RULE_SOFT: '#E3DCC8',
  INK:       '#16140F',
  INK_SOFT:  '#34302A',
  MUTE:      '#7B7461',
  LIME:      '#D8FF3D',
  LIME_DEEP: '#6B8F12',
  LIME_INK:  '#3C5108',
  LIME_SOFT: '#ECF7B3',
  BLUSH:     '#DD6E4E',
  PLUM:      '#5E4E78',
};

// ============== WORDMARK ==============
function V3Wordmark({ size = 80, color, accent }) {
  const c = color || V3.INK;
  const a = accent || V3.LIME_DEEP;
  return (
    <span className="serif-italic" style={{
      fontSize: size, color: c, lineHeight: 0.9, letterSpacing: '-0.015em',
      display: 'inline-flex', alignItems: 'baseline',
    }}>
      freestyle
      <span style={{ color: a, marginLeft: -size * 0.06 }}>.</span>
    </span>
  );
}

// ============== SLASH MARK ==============
// Light-mode default: deep chartreuse on light backgrounds. When sitting on
// a vivid chartreuse fill, pass color={V3.INK} to invert.
function MarkSlash3({ size = 64, color, fill, glow = false }) {
  const c = color || V3.LIME_DEEP;
  const s = size;
  const w = s * 0.16;
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{
      filter: glow ? `drop-shadow(0 0 ${s * 0.1}px ${V3.LIME})` : 'none',
      overflow: 'visible',
    }}>
      {fill && (
        <rect x="0" y="0" width={s} height={s} rx={s * 0.18} fill={fill} />
      )}
      <line x1={s * 0.78} y1={s * 0.14} x2={s * 0.22} y2={s * 0.86}
        stroke={c} strokeWidth={w} strokeLinecap="round" />
    </svg>
  );
}

function MarkCaret3({ size = 64, color }) {
  const c = color || V3.LIME_DEEP;
  const s = size, w = s * 0.14;
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{ overflow:'visible' }}>
      <path d={`M ${s*0.3} ${s*0.18} L ${s*0.74} ${s*0.5} L ${s*0.3} ${s*0.82}`}
        stroke={c} strokeWidth={w} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MarkPulse3({ size = 64, color }) {
  const c = color || V3.LIME_DEEP;
  const s = size, w = s * 0.13;
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <line x1={s*0.26} y1={s*0.36} x2={s*0.26} y2={s*0.64} stroke={c} strokeWidth={w} strokeLinecap="round" />
      <line x1={s*0.5}  y1={s*0.15} x2={s*0.5}  y2={s*0.85} stroke={c} strokeWidth={w} strokeLinecap="round" />
      <line x1={s*0.74} y1={s*0.36} x2={s*0.74} y2={s*0.64} stroke={c} strokeWidth={w} strokeLinecap="round" />
    </svg>
  );
}

function MarkAurora3({ size = 64, color }) {
  const c = color || V3.LIME_DEEP;
  const s = size, w = s * 0.1;
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <path d={`M ${s*0.1} ${s*0.6} Q ${s*0.3} ${s*0.6}, ${s*0.4} ${s*0.4}
                T ${s*0.6} ${s*0.4} T ${s*0.9} ${s*0.6}`}
        stroke={c} strokeWidth={w} fill="none" strokeLinecap="round" />
    </svg>
  );
}

function MarkListen3({ size = 64, color }) {
  const c = color || V3.LIME_DEEP;
  const s = size, w = s * 0.09;
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      <circle cx={s*0.32} cy={s*0.5} r={s*0.08} fill={c} />
      <path d={`M ${s*0.5} ${s*0.32} Q ${s*0.62} ${s*0.5}, ${s*0.5} ${s*0.68}`} stroke={c} strokeWidth={w} fill="none" strokeLinecap="round" />
      <path d={`M ${s*0.66} ${s*0.22} Q ${s*0.84} ${s*0.5}, ${s*0.66} ${s*0.78}`} stroke={c} strokeWidth={w} fill="none" strokeLinecap="round" opacity="0.55" />
    </svg>
  );
}

function MarkSpark3({ size = 64, color }) {
  const c = color || V3.LIME_DEEP;
  const s = size, w = s * 0.1;
  const rays = [0, 60, 120].map(a => a * Math.PI / 180);
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`}>
      {rays.map((a, i) => (
        <line key={i}
          x1={s/2 + Math.cos(a) * s * 0.32}
          y1={s/2 + Math.sin(a) * s * 0.32}
          x2={s/2 - Math.cos(a) * s * 0.32}
          y2={s/2 - Math.sin(a) * s * 0.32}
          stroke={c} strokeWidth={w} strokeLinecap="round" />
      ))}
    </svg>
  );
}

// ============== OSCILLOSCOPE TRACE ==============
function ScopeTrace3({ width = 600, height = 80, color, weight = 1.6, cycles = 3.5, phase = 0, opacity = 1 }) {
  const c = color || V3.INK;
  const N = 200;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const x = (i / N) * width;
    const t = i / N;
    const y = height/2 + (
      Math.sin((t * cycles * 2 * Math.PI) + phase) * height * 0.34 +
      Math.sin((t * cycles * 4.5 * Math.PI) + phase * 1.3) * height * 0.08
    );
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{ opacity, overflow:'visible' }}>
      <polyline points={pts.join(' ')} fill="none" stroke={c} strokeWidth={weight} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ============== WAVEFORM BARS ==============
function VoiceBars3({ count = 24, width = 240, height = 36, color, animated = false, seed = 0 }) {
  const c = color || V3.INK;
  const heights = React.useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      const s = Math.sin((i + 1 + seed) * 12.9898) * 43758.5453;
      const r = s - Math.floor(s);
      const envelope = 1 - Math.abs((i / (count - 1)) - 0.5) * 1.2;
      return Math.max(0.18, Math.min(1, (0.35 + r * 0.65) * envelope));
    });
  }, [count, seed]);

  const barW = (width - (count - 1) * 3) / count;

  return (
    <div style={{ display:'flex', alignItems:'center', gap: 3, width, height }}>
      {heights.map((h, i) => (
        <span key={i} style={{
          width: barW, height: `${h * 100}%`, background: c, borderRadius: 999,
          animation: animated ? `v3bar 0.9s ${(i % 7) * 0.08}s infinite ease-in-out alternate` : 'none',
        }} />
      ))}
      <style>{`@keyframes v3bar { 0%{transform:scaleY(0.45)} 100%{transform:scaleY(1.05)} }`}</style>
    </div>
  );
}

// ============== PULSE RING ==============
function PulseRing3({ size = 220, color, count = 4 }) {
  const c = color || V3.INK;
  const rings = Array.from({ length: count }, (_, i) => i);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ overflow:'visible' }}>
      {rings.map(i => {
        const t = (i + 1) / (count + 0.5);
        return (
          <circle key={i} cx={size/2} cy={size/2}
            r={(size/2) * t}
            fill="none" stroke={c}
            strokeWidth={1 + (1 - t) * 1.4}
            opacity={0.15 + (1 - t) * 0.75}
          />
        );
      })}
      <circle cx={size/2} cy={size/2} r={4} fill={c} />
    </svg>
  );
}

// ============== EYEBROW ==============
function V3Eyebrow({ text, accent, color }) {
  const a = accent || V3.LIME_DEEP;
  const c = color || V3.MUTE;
  return (
    <div style={{ display:'inline-flex', alignItems:'center', gap: 10 }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: a }} />
      <span className="mono" style={{
        fontSize: 11, letterSpacing: '0.18em', textTransform:'uppercase', color: c,
      }}>{text}</span>
    </div>
  );
}

// ============== REC BADGE ==============
// Bright chartreuse fill — the "live" badge.
function RecBadge({ text = 'REC', big = false }) {
  const h = big ? 30 : 22;
  return (
    <span className="mono" style={{
      display:'inline-flex', alignItems:'center', gap: 7,
      height: h, padding: `0 ${big ? 12 : 9}px`, borderRadius: 6,
      background: V3.LIME, color: V3.LIME_INK,
      fontSize: big ? 13 : 10.5, fontWeight: 600, letterSpacing: '0.14em',
      border: `1px solid ${V3.LIME_DEEP}`,
    }}>
      <span style={{
        width: big ? 8 : 6, height: big ? 8 : 6, borderRadius:'50%',
        background: V3.LIME_INK,
      }} />
      {text}
    </span>
  );
}

// ============== TICK AXIS ==============
function TickAxis3({ width = 420, ticks = 14, color }) {
  const c = color || V3.MUTE;
  return (
    <svg width={width} height={10} viewBox={`0 0 ${width} 10`}>
      {Array.from({ length: ticks + 1 }, (_, i) => {
        const x = (i / ticks) * (width - 1) + 0.5;
        const big = i % 4 === 0;
        return <line key={i} x1={x} x2={x} y1={2} y2={big ? 9 : 6} stroke={c} strokeWidth="1" />;
      })}
    </svg>
  );
}

// ============== CROSSHAIR ==============
function Crosshair3({ size = 12, color }) {
  const c = color || V3.RULE;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <line x1={size/2} y1={1} x2={size/2} y2={size-1} stroke={c} strokeWidth="1" />
      <line x1={1} y1={size/2} x2={size-1} y2={size/2} stroke={c} strokeWidth="1" />
    </svg>
  );
}

Object.assign(window, {
  V3, V3Wordmark, V3Eyebrow, RecBadge,
  MarkSlash3, MarkCaret3, MarkPulse3, MarkAurora3, MarkListen3, MarkSpark3,
  ScopeTrace3, VoiceBars3, PulseRing3, TickAxis3, Crosshair3,
});
