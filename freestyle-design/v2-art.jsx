// Freestyle — After Hours art primitives.
// Voice rendered as luminescent threads, oscilloscope traces, pulse rings,
// fine waveform bars. Pure SVG; CSS box-shadow handles the bloom.

// Design tokens (also referenced by name in other v2 files)
const V2 = {
  VOID:      '#07080C',
  INK:       '#0E1016',
  SURFACE:   '#161922',
  SURFACE2:  '#1F222C',
  RULE:      '#262A35',
  RULE_SOFT: '#1C1F28',
  TEXT:      '#ECE7DC',
  TEXT_SOFT: '#B5AD9E',
  MUTE:      '#6A6356',
  LIME:      '#D8FF3D',
  LIME_DEEP: '#B6E020',
  LIME_SOFT: 'rgba(216, 255, 61, 0.12)',
  BLUSH:     '#E8927C',
  PLUM:      '#6B5B8A',
};

// ============== WORDMARK ==============
// "freestyle" in italic Instrument Serif. Note: NOT capitalised. The slash
// stands in for the dot on the i — once your eye sees it, you can't un-see it.
function V2Wordmark({ size = 80, color = V2.TEXT, accent = V2.LIME, glow = true }) {
  return (
    <span className="serif-italic" style={{
      fontSize: size, color, lineHeight: 0.9, letterSpacing: '-0.015em',
      display: 'inline-flex', alignItems: 'baseline',
    }}>
      freestyle
      <span style={{
        color: accent, marginLeft: -size * 0.06,
        textShadow: glow ? `0 0 ${size * 0.4}px ${accent}aa, 0 0 ${size * 0.12}px ${accent}` : 'none',
      }}>.</span>
    </span>
  );
}

// ============== SLASH MARK (recommended) ==============
// A single forward slash rendered as a glowing thread. Reads as cursor,
// frequency line, and the letter motion in one stroke.
function MarkSlash({ size = 64, color = V2.LIME, glow = true }) {
  const s = size;
  const w = s * 0.16;
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{
      filter: glow ? `drop-shadow(0 0 ${s * 0.18}px ${color}aa)` : 'none',
      overflow: 'visible',
    }}>
      <line x1={s * 0.78} y1={s * 0.14} x2={s * 0.22} y2={s * 0.86}
        stroke={color} strokeWidth={w} strokeLinecap="round" />
    </svg>
  );
}

// ============== OTHER MARK EXPLORATIONS ==============

// Caret — a > tipped right, suggesting "input" / playback
function MarkCaret({ size = 64, color = V2.LIME, glow = true }) {
  const s = size, w = s * 0.14;
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{
      filter: glow ? `drop-shadow(0 0 ${s * 0.16}px ${color}aa)` : 'none', overflow:'visible',
    }}>
      <path d={`M ${s*0.3} ${s*0.18} L ${s*0.74} ${s*0.5} L ${s*0.3} ${s*0.82}`}
        stroke={color} strokeWidth={w} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Pulse — three vertical bars, central tallest. The classic waveform glyph.
function MarkPulse({ size = 64, color = V2.LIME, glow = true }) {
  const s = size, w = s * 0.13;
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{
      filter: glow ? `drop-shadow(0 0 ${s * 0.16}px ${color}aa)` : 'none', overflow:'visible',
    }}>
      <line x1={s*0.26} y1={s*0.36} x2={s*0.26} y2={s*0.64} stroke={color} strokeWidth={w} strokeLinecap="round" />
      <line x1={s*0.5} y1={s*0.15} x2={s*0.5} y2={s*0.85} stroke={color} strokeWidth={w} strokeLinecap="round" />
      <line x1={s*0.74} y1={s*0.36} x2={s*0.74} y2={s*0.64} stroke={color} strokeWidth={w} strokeLinecap="round" />
    </svg>
  );
}

// Aurora — a single sine peak, drawn fine
function MarkAurora({ size = 64, color = V2.LIME, glow = true }) {
  const s = size, w = s * 0.1;
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{
      filter: glow ? `drop-shadow(0 0 ${s * 0.18}px ${color}aa)` : 'none', overflow:'visible',
    }}>
      <path d={`M ${s*0.1} ${s*0.6} Q ${s*0.3} ${s*0.6}, ${s*0.4} ${s*0.4}
                T ${s*0.6} ${s*0.4} T ${s*0.9} ${s*0.6}`}
        stroke={color} strokeWidth={w} fill="none" strokeLinecap="round" />
    </svg>
  );
}

// Listen — three nested arcs, like ripples expanding right
function MarkListen({ size = 64, color = V2.LIME, glow = true }) {
  const s = size, w = s * 0.09;
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{
      filter: glow ? `drop-shadow(0 0 ${s * 0.16}px ${color}aa)` : 'none', overflow:'visible',
    }}>
      <circle cx={s*0.32} cy={s*0.5} r={s*0.08} fill={color} />
      <path d={`M ${s*0.5} ${s*0.32} Q ${s*0.62} ${s*0.5}, ${s*0.5} ${s*0.68}`} stroke={color} strokeWidth={w} fill="none" strokeLinecap="round" />
      <path d={`M ${s*0.66} ${s*0.22} Q ${s*0.84} ${s*0.5}, ${s*0.66} ${s*0.78}`} stroke={color} strokeWidth={w} fill="none" strokeLinecap="round" opacity="0.55" />
    </svg>
  );
}

// Spark — a small asterisk burst (six rays). Spoken-word energy.
function MarkSpark({ size = 64, color = V2.LIME, glow = true }) {
  const s = size, w = s * 0.1;
  const rays = [0, 60, 120].map(a => a * Math.PI / 180);
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={{
      filter: glow ? `drop-shadow(0 0 ${s * 0.18}px ${color}aa)` : 'none', overflow:'visible',
    }}>
      {rays.map((a, i) => (
        <line key={i}
          x1={s/2 + Math.cos(a) * s * 0.32}
          y1={s/2 + Math.sin(a) * s * 0.32}
          x2={s/2 - Math.cos(a) * s * 0.32}
          y2={s/2 - Math.sin(a) * s * 0.32}
          stroke={color} strokeWidth={w} strokeLinecap="round" />
      ))}
    </svg>
  );
}

// ============== OSCILLOSCOPE TRACE ==============
// Smooth multi-cycle waveform. Used decoratively on hero and brand poster.
function ScopeTrace({ width = 600, height = 80, color = V2.LIME, weight = 1.6, cycles = 3.5, phase = 0, glow = true, opacity = 1 }) {
  const N = 200;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const x = (i / N) * width;
    const t = i / N;
    // Mix two sines for an organic look
    const y = height/2 + (
      Math.sin((t * cycles * 2 * Math.PI) + phase) * height * 0.34 +
      Math.sin((t * cycles * 4.5 * Math.PI) + phase * 1.3) * height * 0.08
    );
    pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
  }
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} style={{
      filter: glow ? `drop-shadow(0 0 8px ${color}66)` : 'none', overflow:'visible', opacity,
    }}>
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={weight} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ============== WAVEFORM BARS ==============
// Discrete vertical bars — for the listening pill and "voice levels" feel.
function VoiceBars({ count = 24, width = 240, height = 36, color = V2.LIME, animated = false, glow = true, seed = 0 }) {
  // Deterministic pseudo-random heights for static use
  const heights = React.useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      const s = Math.sin((i + 1 + seed) * 12.9898) * 43758.5453;
      const r = s - Math.floor(s);
      // Bias toward middle being taller (envelope)
      const envelope = 1 - Math.abs((i / (count - 1)) - 0.5) * 1.2;
      return Math.max(0.15, Math.min(1, (0.35 + r * 0.65) * envelope));
    });
  }, [count, seed]);

  const barW = (width - (count - 1) * 3) / count;

  return (
    <div style={{
      display:'flex', alignItems:'center', gap: 3, width, height,
      filter: glow ? `drop-shadow(0 0 6px ${color}66)` : 'none',
    }}>
      {heights.map((h, i) => (
        <span key={i} style={{
          width: barW, height: `${h * 100}%`, background: color, borderRadius: 999,
          animation: animated ? `v2bar 0.9s ${(i % 7) * 0.08}s infinite ease-in-out alternate` : 'none',
          transformOrigin: 'center',
        }} />
      ))}
      <style>{`
        @keyframes v2bar { 0%{transform:scaleY(0.45)} 100%{transform:scaleY(1.05)} }
      `}</style>
    </div>
  );
}

// ============== PULSE RING ==============
// Concentric arcs, fine. Echo / room-tone.
function PulseRing({ size = 220, color = V2.LIME, glow = true, count = 4 }) {
  const rings = Array.from({ length: count }, (_, i) => i);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{
      filter: glow ? `drop-shadow(0 0 18px ${color}55)` : 'none', overflow:'visible',
    }}>
      {rings.map(i => {
        const t = (i + 1) / (count + 0.5);
        return (
          <circle key={i} cx={size/2} cy={size/2}
            r={(size/2) * t}
            fill="none" stroke={color}
            strokeWidth={1 + (1 - t) * 1.4}
            opacity={0.15 + (1 - t) * 0.75}
          />
        );
      })}
      <circle cx={size/2} cy={size/2} r={4} fill={color} />
    </svg>
  );
}

// ============== EYEBROW LABEL ==============
function V2Eyebrow({ text, accent = V2.LIME, color = V2.TEXT_SOFT }) {
  return (
    <div style={{ display:'inline-flex', alignItems:'center', gap: 10 }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%', background: accent,
        boxShadow: `0 0 8px ${accent}`,
      }} />
      <span className="mono" style={{
        fontSize: 11, letterSpacing: '0.16em', textTransform:'uppercase', color,
      }}>{text}</span>
    </div>
  );
}

// ============== HORIZONTAL TICK SCALE ==============
// Fine ruler-style tick marks, used as a "time" axis under the waveform.
function TickAxis({ width = 420, ticks = 14, color = V2.MUTE }) {
  return (
    <svg width={width} height={10} viewBox={`0 0 ${width} 10`}>
      {Array.from({ length: ticks + 1 }, (_, i) => {
        const x = (i / ticks) * (width - 1) + 0.5;
        const big = i % 4 === 0;
        return <line key={i} x1={x} x2={x} y1={2} y2={big ? 9 : 6} stroke={color} strokeWidth="1" />;
      })}
    </svg>
  );
}

// ============== CROSS HAIR ==============
// Tiny + glyph used as registration marks in corners.
function Crosshair({ size = 12, color = V2.MUTE }) {
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <line x1={size/2} y1={1} x2={size/2} y2={size-1} stroke={color} strokeWidth="1" />
      <line x1={1} y1={size/2} x2={size-1} y2={size/2} stroke={color} strokeWidth="1" />
    </svg>
  );
}

Object.assign(window, {
  V2,
  V2Wordmark, V2Eyebrow,
  MarkSlash, MarkCaret, MarkPulse, MarkAurora, MarkListen, MarkSpark,
  ScopeTrace, VoiceBars, PulseRing, TickAxis, Crosshair,
});
