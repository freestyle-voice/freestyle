// Freestyle — Studio art primitives. Light mode, olive-only accent.
// The flourish mark replaces the slash — a single calligraphic stroke
// that loops once and tails off. Drawn freehand, never with a ruler.

const V4 = {
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
};

// ============== WORDMARK ==============
// "freestyle" in italic Instrument Serif, with a flourish-period.
function V4Wordmark({ size = 80, color, accent }) {
  const c = color || V4.INK;
  const a = accent || V4.OLIVE;
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

// ============== WAVE (the recommended mark) ==============
// A crescendo sound-wave: starts as a small ripple on the left and grows
// into a full swing on the right. Amplitude scales LINEARLY with t so each
// peak is bigger than the last — like a voice warming up.
function MarkFlourish({ size = 64, color, weight, cycles = 2.5, peakAmp = 35 }) {
  const c = color || V4.OLIVE;
  const s = size;
  const w = weight || s * 0.09;
  const N = 140;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = 8 + t * 84;
    const amp = peakAmp * t;  // linear growth — small left, big right
    const y = 50 - amp * Math.sin(2 * Math.PI * cycles * t);
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return (
    <svg width={s} height={s} viewBox="0 0 100 100" style={{ overflow:'visible' }}>
      <polyline
        points={pts.join(' ')}
        fill="none"
        stroke={c}
        strokeWidth={w * (100 / s)}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ============== LOOP ==============
// A simple closed loop with a tail — like the end of a signature.
function MarkLoop({ size = 64, color }) {
  const c = color || V4.OLIVE;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ overflow:'visible' }}>
      <path
        d="M 12 70
           C 18 30, 70 22, 70 50
           C 70 78, 30 70, 36 48
           C 42 26, 88 32, 92 62"
        fill="none" stroke={c} strokeWidth="7"
        strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

// ============== GLIDE ==============
// An asymmetric S-curve flourish.
function MarkGlide({ size = 64, color }) {
  const c = color || V4.OLIVE;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ overflow:'visible' }}>
      <path
        d="M 10 80
           C 30 30, 50 80, 70 30
           C 78 16, 90 22, 92 36"
        fill="none" stroke={c} strokeWidth="7.5"
        strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

// ============== CURL ==============
// Open inward spiral — sound entering the ear.
function MarkCurl({ size = 64, color }) {
  const c = color || V4.OLIVE;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ overflow:'visible' }}>
      <path
        d="M 50 50
           m -22 0
           a 22 22 0 1 1 28 21
           a 14 14 0 1 1 -14 -23
           a 8 8 0 1 1 12 8"
        fill="none" stroke={c} strokeWidth="7"
        strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

// ============== KNOT ==============
// A double-loop tied in the middle.
function MarkKnot({ size = 64, color }) {
  const c = color || V4.OLIVE;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ overflow:'visible' }}>
      <path
        d="M 18 70
           C 18 30, 58 28, 50 50
           C 42 72, 82 70, 82 30
           C 82 18, 22 18, 18 70"
        fill="none" stroke={c} strokeWidth="7"
        strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

// ============== UNDERSCORE ==============
// A single broad brush-stroke that swoops with a slight tail-up at the end.
function MarkSwash({ size = 64, color }) {
  const c = color || V4.OLIVE;
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" style={{ overflow:'visible' }}>
      <path
        d="M 8 64
           C 30 80, 60 80, 84 56
           C 92 48, 88 36, 76 38"
        fill="none" stroke={c} strokeWidth="8"
        strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

// ============== OSCILLOSCOPE TRACE ==============
function ScopeTrace4({ width = 600, height = 80, color, weight = 1.6, cycles = 3.5, phase = 0, opacity = 1 }) {
  const c = color || V4.INK;
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
function VoiceBars4({ count = 24, width = 240, height = 36, color, animated = false, seed = 0 }) {
  const c = color || V4.INK;
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
          animation: animated ? `v4bar 0.9s ${(i % 7) * 0.08}s infinite ease-in-out alternate` : 'none',
        }} />
      ))}
      <style>{`@keyframes v4bar { 0%{transform:scaleY(0.45)} 100%{transform:scaleY(1.05)} }`}</style>
    </div>
  );
}

// ============== PULSE RING ==============
function PulseRing4({ size = 220, color, count = 4 }) {
  const c = color || V4.INK;
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
function V4Eyebrow({ text, accent, color }) {
  const a = accent || V4.OLIVE;
  const c = color || V4.MUTE;
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
// Olive fill, cream text. Editorial stamp feel.
function RecBadge4({ text = 'REC', big = false }) {
  const h = big ? 30 : 22;
  return (
    <span className="mono" style={{
      display:'inline-flex', alignItems:'center', gap: 7,
      height: h, padding: `0 ${big ? 12 : 9}px`, borderRadius: 6,
      background: V4.OLIVE, color: V4.CANVAS,
      fontSize: big ? 13 : 10.5, fontWeight: 600, letterSpacing: '0.14em',
    }}>
      <span style={{
        width: big ? 8 : 6, height: big ? 8 : 6, borderRadius:'50%',
        background: V4.CANVAS,
      }} />
      {text}
    </span>
  );
}

// ============== TICK AXIS ==============
function TickAxis4({ width = 420, ticks = 14, color }) {
  const c = color || V4.MUTE;
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
function Crosshair4({ size = 12, color }) {
  const c = color || V4.RULE;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <line x1={size/2} y1={1} x2={size/2} y2={size-1} stroke={c} strokeWidth="1" />
      <line x1={1} y1={size/2} x2={size-1} y2={size/2} stroke={c} strokeWidth="1" />
    </svg>
  );
}

Object.assign(window, {
  V4, V4Wordmark, V4Eyebrow, RecBadge4,
  MarkFlourish, MarkLoop, MarkGlide, MarkCurl, MarkKnot, MarkSwash,
  ScopeTrace4, VoiceBars4, PulseRing4, TickAxis4, Crosshair4,
});
