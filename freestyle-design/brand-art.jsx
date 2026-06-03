// Freestyle — illustration system.
// All "drawings" are simple line motifs (loops, wavy strokes, dots).
// Single-stroke energy: nothing more complex than a curve, a circle, a tick.
// Use ink as the default; coral/sage as accents.

const ART_INK   = '#1B1814';
const ART_PAPER = '#F1EBDD';
const ART_CORAL = '#F5511D';
const ART_SAGE  = '#6E8A6A';
const ART_MUTE  = '#8E8473';

// A long loose squiggle — the "voice line".
// stroke gets a slight roughness via two overlapping paths (one offset).
function Squiggle({ width=320, height=64, stroke=ART_INK, weight=3.5, style={} }) {
  // sin-wave-ish path, generated for consistency.
  const pts = [];
  const N = 9;
  for (let i = 0; i <= N; i++) {
    const x = (i / N) * (width - 16) + 8;
    const y = height/2 + Math.sin(i * 1.05 + 0.3) * (height/2 - 8) * 0.85;
    pts.push([x, y]);
  }
  // cardinal-spline-ish via Q's
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i+1];
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    d += ` Q ${x1} ${y1} ${cx} ${cy}`;
  }
  d += ` T ${pts[pts.length-1][0]} ${pts[pts.length-1][1]}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={style}>
      <path d={d} fill="none" stroke={stroke} strokeWidth={weight} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// A single bigger loop, like a cursive 'l'/'e' — abstract speech.
function LoopMark({ size=120, stroke=ART_INK, weight=4, style={} }) {
  const s = size;
  // start lower-left, loop up and around, exit lower-right
  const d = `
    M ${s*0.10} ${s*0.78}
    C ${s*0.05} ${s*0.20}, ${s*0.55} ${s*-0.08}, ${s*0.62} ${s*0.42}
    C ${s*0.66} ${s*0.74}, ${s*0.30} ${s*0.78}, ${s*0.38} ${s*0.50}
    C ${s*0.46} ${s*0.22}, ${s*0.86} ${s*0.30}, ${s*0.92} ${s*0.72}
  `;
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={style}>
      <path d={d} fill="none" stroke={stroke} strokeWidth={weight} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// A speech "burst" — a circle with three short ticks radiating outward.
function Burst({ size=72, stroke=ART_INK, weight=3, style={} }) {
  const c = size/2;
  const r = size * 0.16;
  const ticks = [
    [c, c - r*2.2,   c, c - r*3.4],
    [c + r*1.9, c - r*1.6, c + r*2.9, c - r*2.6],
    [c - r*1.9, c - r*1.6, c - r*2.9, c - r*2.6],
    [c + r*2.4, c + r*0.1, c + r*3.6, c + r*0.1],
    [c - r*2.4, c + r*0.1, c - r*3.6, c + r*0.1],
  ];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={style}>
      <circle cx={c} cy={c} r={r} fill={stroke} />
      {ticks.map(([x1,y1,x2,y2], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={weight} strokeLinecap="round" />
      ))}
    </svg>
  );
}

// An open quote shape — built from two short curls.
function QuoteCurls({ size=80, stroke=ART_INK, weight=4, color2=ART_CORAL, style={} }) {
  const s = size;
  return (
    <svg width={s} height={s*0.6} viewBox={`0 0 ${s} ${s*0.6}`} style={style}>
      <path d={`M ${s*0.10} ${s*0.42} C ${s*0.05} ${s*0.18}, ${s*0.22} ${s*0.06}, ${s*0.30} ${s*0.18} C ${s*0.36} ${s*0.28}, ${s*0.28} ${s*0.36}, ${s*0.18} ${s*0.32}`}
        fill="none" stroke={stroke} strokeWidth={weight} strokeLinecap="round" />
      <path d={`M ${s*0.55} ${s*0.42} C ${s*0.50} ${s*0.18}, ${s*0.67} ${s*0.06}, ${s*0.75} ${s*0.18} C ${s*0.81} ${s*0.28}, ${s*0.73} ${s*0.36}, ${s*0.63} ${s*0.32}`}
        fill="none" stroke={color2} strokeWidth={weight} strokeLinecap="round" />
    </svg>
  );
}

// A bouncing dot baseline — like the dots over an "i" repeating into a sentence.
function DotLine({ count=7, gap=22, dot=6, color=ART_INK, accent=ART_CORAL, accentIdx=2, style={} }) {
  const w = (count - 1) * gap + dot;
  return (
    <svg width={w} height={dot} viewBox={`0 0 ${w} ${dot}`} style={style}>
      {Array.from({length: count}).map((_, i) => (
        <circle key={i} cx={i*gap + dot/2} cy={dot/2} r={dot/2} fill={i===accentIdx ? accent : color} />
      ))}
    </svg>
  );
}

// A scribble-in-a-circle — the app icon glyph. Single squiggle inside a ring.
function ScribbleBadge({ size=128, bg=ART_PAPER, fg=ART_INK, accent=ART_CORAL, ring=true, style={} }) {
  const s = size;
  const c = s/2;
  const r = s*0.46;
  // two stacked squiggle paths
  const path = (yOffset, amp) => {
    const pts = [];
    const N = 6;
    const innerW = s * 0.62;
    const startX = c - innerW/2;
    for (let i = 0; i <= N; i++) {
      const x = startX + (i/N) * innerW;
      const y = c + yOffset + Math.sin(i*1.1) * amp;
      pts.push([x, y]);
    }
    let d = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[i+1];
      d += ` Q ${x1} ${y1} ${(x1+x2)/2} ${(y1+y2)/2}`;
    }
    d += ` T ${pts[pts.length-1][0]} ${pts[pts.length-1][1]}`;
    return d;
  };
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={style}>
      <circle cx={c} cy={c} r={r} fill={bg} stroke={ring ? fg : 'none'} strokeWidth={s*0.025} />
      <path d={path(-s*0.10, s*0.07)} fill="none" stroke={fg} strokeWidth={s*0.045} strokeLinecap="round" />
      <path d={path( s*0.08, s*0.06)} fill="none" stroke={accent} strokeWidth={s*0.045} strokeLinecap="round" />
    </svg>
  );
}

// A small "tail loop" used at the end of the wordmark.
function TailLoop({ width=60, height=42, color=ART_CORAL, weight=4.5, style={} }) {
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={style}>
      <path d={`M 2 ${height*0.40}
                C ${width*0.10} ${height*0.05}, ${width*0.55} ${height*0.05}, ${width*0.55} ${height*0.45}
                C ${width*0.55} ${height*0.85}, ${width*0.25} ${height*0.85}, ${width*0.30} ${height*0.55}
                C ${width*0.35} ${height*0.30}, ${width*0.75} ${height*0.30}, ${width*0.96} ${height*0.62}`}
        fill="none" stroke={color} strokeWidth={weight} strokeLinecap="round" />
    </svg>
  );
}

// Underline scribble — wavy, used to emphasize a word.
function Underwave({ width=180, height=14, color=ART_CORAL, weight=3.5, style={} }) {
  const pts = [];
  const N = 10;
  for (let i = 0; i <= N; i++) {
    const x = (i/N) * (width - 8) + 4;
    const y = height/2 + Math.sin(i * 1.6) * (height*0.35);
    pts.push([x,y]);
  }
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x1,y1] = pts[i];
    const [x2,y2] = pts[i+1];
    d += ` Q ${x1} ${y1} ${(x1+x2)/2} ${(y1+y2)/2}`;
  }
  d += ` T ${pts[pts.length-1][0]} ${pts[pts.length-1][1]}`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={style}>
      <path d={d} fill="none" stroke={color} strokeWidth={weight} strokeLinecap="round" />
    </svg>
  );
}

// A waveform that looks playful, not technical — vertical bars of varying height,
// drawn with rounded caps. Optional animation.
function VoiceBars({ count=14, width=180, height=44, color=ART_INK, accent=ART_CORAL, animated=false, seed=2, style={} }) {
  // deterministic pseudo-random
  const rand = (i) => {
    const x = Math.sin(i * 12.9898 + seed * 7.233) * 43758.5453;
    return x - Math.floor(x);
  };
  const gap = width / count;
  const cap = Math.min(gap*0.55, 5);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={style}>
      {Array.from({length: count}).map((_, i) => {
        const h = (0.18 + rand(i) * 0.82) * height;
        const x = i * gap + gap/2;
        const accentBar = (i === Math.floor(count*0.45) || i === Math.floor(count*0.7));
        return (
          <line key={i}
            x1={x} y1={height/2 - h/2}
            x2={x} y2={height/2 + h/2}
            stroke={accentBar ? accent : color}
            strokeWidth={cap}
            strokeLinecap="round">
            {animated && (
              <animate attributeName="y1"
                values={`${height/2 - h/2}; ${height/2 - (h*0.4)/2}; ${height/2 - (h*1.05)/2}; ${height/2 - h/2}`}
                dur={`${1.2 + rand(i)*0.8}s`} repeatCount="indefinite" />
            )}
            {animated && (
              <animate attributeName="y2"
                values={`${height/2 + h/2}; ${height/2 + (h*0.4)/2}; ${height/2 + (h*1.05)/2}; ${height/2 + h/2}`}
                dur={`${1.2 + rand(i)*0.8}s`} repeatCount="indefinite" />
            )}
          </line>
        );
      })}
    </svg>
  );
}

// The Freestyle wordmark. Uses Bricolage with a wide-set 'y' and a coral tail loop.
function Wordmark({ size=64, color=ART_INK, accent=ART_CORAL, style={} }) {
  return (
    <span className="display" style={{
      display: 'inline-flex',
      alignItems: 'baseline',
      fontSize: size,
      fontWeight: 700,
      color,
      letterSpacing: '-0.035em',
      lineHeight: 0.9,
      fontVariationSettings: `'wdth' 88, 'opsz' 72`,
      ...style,
    }}>
      <span style={{ position: 'relative' }}>
        Freestyle
        <span aria-hidden="true" style={{
          position: 'absolute',
          left: '-2%',
          right: '-2%',
          bottom: `-${size * 0.22}px`,
          display: 'block',
          pointerEvents: 'none',
        }}>
          <Underwave width={size * 4.8} height={size * 0.18} color={accent} weight={size * 0.05} />
        </span>
      </span>
    </span>
  );
}

// Lockup: icon + wordmark in a row. Uses the Resolve mark (post-Matthew feedback).
function WordmarkLockup({ size=56, color=ART_INK, accent=ART_CORAL, style={} }) {
  // MarkResolve is defined in brand-marks.jsx; it's on window at load time.
  const Mark = window.MarkResolve;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap: size*0.32, ...style }}>
      {Mark ? <Mark size={size*1.05} color={color} accent={accent} /> : null}
      <Wordmark size={size} color={color} accent={accent} />
    </span>
  );
}

Object.assign(window, {
  ART_INK, ART_PAPER, ART_CORAL, ART_SAGE, ART_MUTE,
  Squiggle, LoopMark, Burst, QuoteCurls, DotLine, ScribbleBadge,
  TailLoop, Underwave, VoiceBars, Wordmark, WordmarkLockup,
});
