// Freestyle — iconic mark explorations.
// Six standalone marks, no circle wrapper. Built for the 16px favicon test.
// Each is a single confident gesture that keeps the squiggle DNA.

// 1. RESOLVE — voice enters as a wave, resolves into a clean horizontal stroke
// that ends in a single filled dot (the "period"). The curve is a true
// damped sine — sampled densely and rendered with round joins so the wave is
// mathematically smooth, not hand-drawn-lumpy.
function MarkResolve({ size = 128, color = '#1B1814', accent, style = {} }) {
  const s = size;
  const w = s * 0.13;                  // stroke weight
  const cy = s * 0.5;
  const inset = w / 2 + s * 0.02;
  const xL = inset;
  const xR = s - inset;
  // First 72% is the wave; final 28% is the flat resolved line.
  const waveEnd = xL + (xR - xL) * 0.66;
  const oscillations = 1.25;           // 1¼ full sine cycles
  const amp0 = s * 0.22;               // max amplitude at entry
  const N = 96;                        // dense sampling for visual smoothness
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;                   // 0..1 across wave region
    const x = xL + t * (waveEnd - xL);
    const damp = 1 - t;                // linear taper to zero
    const y = cy - amp0 * damp * Math.sin(t * Math.PI * 2 * oscillations);
    pts.push([x, y]);
  }
  let d = `M ${pts[0][0].toFixed(2)} ${pts[0][1].toFixed(2)}`;
  for (let i = 1; i < pts.length; i++) {
    d += ` L ${pts[i][0].toFixed(2)} ${pts[i][1].toFixed(2)}`;
  }
  d += ` L ${xR - w * 1.6} ${cy.toFixed(2)}`;   // resolved line
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={style}>
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={w}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* terminal dot — the "period" at the end of the sentence */}
      <circle cx={xR - w * 0.05} cy={cy} r={w * 0.72} fill={accent || color} />
    </svg>
  );
}

// 2. KNOT — a single line tied in a loose knot. Voice loops around itself.
function MarkKnot({ size = 128, color = '#1B1814', accent, style = {} }) {
  const s = size;
  const w = s * 0.13;
  // single closed-ish path that crosses itself
  const d = `
    M ${s*0.16} ${s*0.74}
    C ${s*0.08} ${s*0.40}, ${s*0.42} ${s*0.06}, ${s*0.62} ${s*0.28}
    C ${s*0.82} ${s*0.50}, ${s*0.42} ${s*0.78}, ${s*0.30} ${s*0.50}
    C ${s*0.18} ${s*0.22}, ${s*0.62} ${s*0.16}, ${s*0.84} ${s*0.50}
    C ${s*0.96} ${s*0.70}, ${s*0.70} ${s*0.86}, ${s*0.52} ${s*0.74}
  `;
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={style}>
      <path d={d} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
      {accent && <circle cx={s*0.52} cy={s*0.74} r={w*0.55} fill={accent} />}
    </svg>
  );
}

// helper: clean sampled sine path, used by several marks
function sineWavePath({ x0, x1, y, amplitude, cycles = 1, phase = 0, samples = 64 }) {
  const pts = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const x = x0 + t * (x1 - x0);
    const yp = y - amplitude * Math.sin(t * Math.PI * 2 * cycles + phase);
    pts.push(`${x.toFixed(2)} ${yp.toFixed(2)}`);
  }
  return 'M ' + pts.join(' L ');
}

// 3. WAVE F — bold F monogram, but the two horizontal bars are clean sine humps.
function MarkWaveF({ size = 128, color = '#1B1814', accent, style = {} }) {
  const s = size;
  const stem = s * 0.18;
  const w = s * 0.14;
  const left = s * 0.18;
  const top = s * 0.10;
  const bottom = s * 0.90;
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={style}>
      <rect x={left} y={top} width={stem} height={bottom - top} rx={stem * 0.45} fill={color} />
      <path
        d={sineWavePath({ x0: left + stem * 0.55, x1: s - w / 2, y: top + s * 0.10, amplitude: s * 0.08, cycles: 1.0 })}
        fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round"
      />
      <path
        d={sineWavePath({ x0: left + stem * 0.55, x1: s * 0.78, y: s * 0.50, amplitude: s * 0.07, cycles: 1.0 })}
        fill="none" stroke={accent || color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

// 4. STACK — three stacked clean sine waves, varying amplitude. Voice rhythm.
function MarkStack({ size = 128, color = '#1B1814', accent, style = {} }) {
  const s = size;
  const w = s * 0.12;
  const left = s * 0.12;
  const right = s * 0.88;
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={style}>
      <path
        d={sineWavePath({ x0: left, x1: right, y: s * 0.27, amplitude: s * 0.07, cycles: 1.0 })}
        fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round"
      />
      <path
        d={sineWavePath({ x0: left, x1: right, y: s * 0.50, amplitude: s * 0.10, cycles: 1.0 })}
        fill="none" stroke={accent || color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round"
      />
      <path
        d={sineWavePath({ x0: left, x1: right, y: s * 0.73, amplitude: s * 0.06, cycles: 1.0 })}
        fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}

// 5. CURL — a single fat comma-like curl. One bold gesture. Reads as a tail / breath.
function MarkCurl({ size = 128, color = '#1B1814', accent, style = {} }) {
  const s = size;
  const w = s * 0.16;
  // start top-right, sweep down-left, curl back under
  const d = `
    M ${s*0.82} ${s*0.20}
    C ${s*0.84} ${s*0.10}, ${s*0.50} ${s*0.08}, ${s*0.30} ${s*0.30}
    C ${s*0.10} ${s*0.52}, ${s*0.12} ${s*0.82}, ${s*0.40} ${s*0.88}
    C ${s*0.62} ${s*0.92}, ${s*0.74} ${s*0.74}, ${s*0.64} ${s*0.58}
    C ${s*0.58} ${s*0.48}, ${s*0.44} ${s*0.46}, ${s*0.40} ${s*0.56}
  `;
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={style}>
      <path d={d} fill="none" stroke={color} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
      {accent && <circle cx={s*0.82} cy={s*0.20} r={w * 0.55} fill={accent} />}
    </svg>
  );
}

// 6. NOTCH — squircle tile with a wave cut into the top edge. Solid-form mark
//    that still carries the voice gesture. Strong silhouette / app-icon energy.
function MarkNotch({ size = 128, color = '#1B1814', accent, style = {} }) {
  const s = size;
  // squircle path (rounded rect that approximates ios icon shape)
  const r = s * 0.28;
  // Build a path: top-left arc → wave across the top → top-right arc → down → bottom arcs → up.
  const m = s * 0.06; // margin inside viewBox
  const x0 = m, x1 = s - m;
  const y0 = m, y1 = s - m;
  const a = s * 0.10; // wave amplitude on top edge
  const d = `
    M ${x0 + r} ${y0}
    C ${x0 + s*0.22} ${y0 - a}, ${x0 + s*0.30} ${y0 + a}, ${x0 + s*0.40} ${y0}
    C ${x0 + s*0.50} ${y0 - a}, ${x0 + s*0.58} ${y0 + a}, ${x1 - r} ${y0}
    C ${x1} ${y0}, ${x1} ${y0}, ${x1} ${y0 + r}
    L ${x1} ${y1 - r}
    C ${x1} ${y1}, ${x1} ${y1}, ${x1 - r} ${y1}
    L ${x0 + r} ${y1}
    C ${x0} ${y1}, ${x0} ${y1}, ${x0} ${y1 - r}
    L ${x0} ${y0 + r}
    C ${x0} ${y0}, ${x0} ${y0}, ${x0 + r} ${y0}
    Z
  `;
  // a small interior squiggle to keep the brand cue — clean sine
  const innerW = s * 0.075;
  const innerY = s * 0.62;
  const inner = sineWavePath({ x0: s * 0.24, x1: s * 0.76, y: innerY, amplitude: s * 0.07, cycles: 1.0 });
  return (
    <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} style={style}>
      <path d={d} fill={color} />
      <path d={inner} fill="none" stroke={accent || '#F1EBDD'} strokeWidth={innerW} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

Object.assign(window, {
  MarkResolve, MarkKnot, MarkWaveF, MarkStack, MarkCurl, MarkNotch,
});
