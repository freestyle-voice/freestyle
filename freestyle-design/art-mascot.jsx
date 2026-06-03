// Freestyle — Echo the dolphin.
// Side-profile cartoon dolphin, olive body with cream belly, ink outline.
// Dolphins echolocate — fitting mascot for a voice tool.

const A = {
  CANVAS:    '#F4F0E4',
  PAPER:     '#ECE7D6',
  CREAM:     '#F8F1DE',
  INK:       '#16140F',
  INK_SOFT:  '#34302A',
  MUTE:      '#7B7461',
  RULE:      '#D6CDB8',
  OLIVE:     '#6B8F12',
  OLIVE_DEEP:'#4A6309',
  OLIVE_INK: '#2E3F05',
  OLIVE_SOFT:'#E8EFC9',
  BLUSH:     '#DD6E4E',
  BLUSH_SOFT:'#F4C3B0',
  PLUM:      '#5E4E78',
};

// ============================================================
// Echo — the dolphin
//
// expression: 'happy' (default smile) | 'speaking' (open mouth + sound waves)
//             | 'sleeping' (closed eye) | 'surprised' (wide eye + small o)
// silhouette: fill body with accent and hide all details
// body:       fill color (default olive)
// belly:      belly highlight color (default cream)
// outline:    stroke color (default ink)
// flip:       mirror horizontally (face left instead of right)
// ============================================================
function Echo({
  size = 300,
  expression = 'happy',
  silhouette = false,
  body = A.OLIVE,
  belly = A.CREAM,
  outline = A.INK,
  outlineWidth = 5,
  flip = false,
  showWaves = false, // sound waves emanating from rostrum
}) {
  // ViewBox: 400 wide × 280 tall. Dolphin faces RIGHT by default.
  const W = 400;
  const H = 280;
  const SW = outlineWidth;

  // ============ TAIL FLUKE (drawn behind body) ============
  // Two pointed flukes meeting at a center notch.
  // Right edge sits inside body so body covers the join.
  const flukePath = `
    M 80 115
    L 6 50
    L 40 135
    L 6 220
    L 80 165
    Z
  `;

  // ============ DORSAL FIN (drawn behind body) ============
  // Tall sail-like curve — the classic dolphin marker.
  const dorsalPath = `
    M 158 74
    Q 198 -10, 242 58
    Q 222 86, 158 74
    Z
  `;

  // ============ BODY ============
  // Side-profile silhouette, clockwise from tail-base top.
  // Two key humps: gentle BACK arch + pronounced MELON. Long pointy ROSTRUM
  // angles slightly upward to create the iconic dolphin smile line.
  const bodyPath = `
    M 72 132
    Q 100 76, 180 68
    Q 235 68, 265 72
    Q 275 40, 305 45
    Q 322 50, 332 82
    Q 365 102, 398 130
    Q 388 140, 365 142
    Q 348 144, 330 146
    Q 320 154, 306 162
    Q 268 188, 198 198
    Q 128 200, 90 182
    Q 70 170, 72 132
    Z
  `;

  // ============ BELLY HIGHLIGHT (no stroke, sits inside body) ============
  const bellyPath = `
    M 90 168
    Q 90 142, 122 140
    Q 200 168, 295 155
    Q 315 157, 335 152
    Q 315 172, 270 184
    Q 200 198, 130 188
    Q 95 178, 90 168
    Z
  `;

  // ============ PECTORAL FIN (in front of body) ============
  const pectoralPath = `
    M 225 168
    Q 260 222, 295 200
    Q 273 170, 225 168
    Z
  `;

  // Face geometry — eye above the mouth, mouth at base of rostrum
  const eye = { cx: 322, cy: 108 };
  const mouth = { x: 348, y: 152 };
  const rostrum = { x: 398, y: 130 };

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width={size}
      height={size * (H / W)}
      style={{ overflow: 'visible', transform: flip ? 'scaleX(-1)' : 'none' }}
      role="img" aria-label="Echo, the Freestyle dolphin mascot"
    >
      {silhouette ? (
        // Single-color silhouette: union of all parts.
        <g fill={body || A.OLIVE}>
          <path d={flukePath} />
          <path d={dorsalPath} />
          <path d={bodyPath} />
          <path d={pectoralPath} />
        </g>
      ) : (
        <>
          {/* BEHIND body */}
          <path d={flukePath}   fill={body} stroke={outline} strokeWidth={SW} strokeLinejoin="round" />
          <path d={dorsalPath}  fill={body} stroke={outline} strokeWidth={SW} strokeLinejoin="round" />

          {/* BODY */}
          <path d={bodyPath} fill={body} stroke={outline} strokeWidth={SW} strokeLinejoin="round" />

          {/* BELLY highlight (no stroke, sits inside body) */}
          <path d={bellyPath} fill={belly} stroke="none" />

          {/* PECTORAL FIN (in front) */}
          <path d={pectoralPath} fill={body} stroke={outline} strokeWidth={SW} strokeLinejoin="round" />

          {/* FACE */}
          <Face expression={expression} eye={eye} mouth={mouth} outline={outline} />

          {/* SOUND WAVES from rostrum */}
          {(showWaves || expression === 'speaking') && (
            <SoundFromRostrum origin={rostrum} color={outline === A.INK ? A.OLIVE : outline} />
          )}
        </>
      )}
    </svg>
  );
}

// ============================================================
// FACE — eye + mouth combinations per expression
// ============================================================
function Face({ expression, eye, mouth, outline }) {
  // Eye variants
  let eyeEl;
  if (expression === 'sleeping') {
    // Closed eye - upturned crescent
    eyeEl = (
      <path d={`M ${eye.cx - 7} ${eye.cy} Q ${eye.cx} ${eye.cy - 5}, ${eye.cx + 7} ${eye.cy}`}
        fill="none" stroke={outline} strokeWidth="3.5" strokeLinecap="round" />
    );
  } else if (expression === 'surprised') {
    // Bigger round eye with a tiny highlight
    eyeEl = (
      <>
        <circle cx={eye.cx} cy={eye.cy} r="6" fill={outline} />
        <circle cx={eye.cx + 2} cy={eye.cy - 2} r="1.6" fill={A.CREAM} />
      </>
    );
  } else {
    // Default — friendly small black dot with highlight
    eyeEl = (
      <>
        <circle cx={eye.cx} cy={eye.cy} r="5" fill={outline} />
        <circle cx={eye.cx + 1.5} cy={eye.cy - 1.5} r="1.4" fill={A.CREAM} />
      </>
    );
  }

  // Mouth variants — the dolphin smile is a line near the rostrum corner
  let mouthEl;
  if (expression === 'speaking') {
    // Slightly open mouth
    mouthEl = (
      <path d={`M ${mouth.x - 14} ${mouth.y - 2} Q ${mouth.x} ${mouth.y + 6}, ${mouth.x + 16} ${mouth.y - 4}`}
        fill="none" stroke={outline} strokeWidth="3.5" strokeLinecap="round" />
    );
  } else if (expression === 'surprised') {
    // Small "o" mouth
    mouthEl = <circle cx={mouth.x + 6} cy={mouth.y} r="4" fill={outline} />;
  } else if (expression === 'sleeping') {
    // Neutral short line
    mouthEl = (
      <line x1={mouth.x - 6} y1={mouth.y} x2={mouth.x + 8} y2={mouth.y - 1}
        stroke={outline} strokeWidth="3" strokeLinecap="round" />
    );
  } else {
    // Default happy upturned dolphin smile
    mouthEl = (
      <path d={`M ${mouth.x - 18} ${mouth.y - 3} Q ${mouth.x - 4} ${mouth.y + 6}, ${mouth.x + 18} ${mouth.y - 6}`}
        fill="none" stroke={outline} strokeWidth="3.5" strokeLinecap="round" />
    );
  }

  return <g>{eyeEl}{mouthEl}</g>;
}

// ============================================================
// Sound waves coming out of the rostrum (echolocation 🐬)
// ============================================================
function SoundFromRostrum({ origin, color = A.OLIVE }) {
  return (
    <g transform={`translate(${origin.x + 12}, ${origin.y - 6})`}>
      {[1, 2, 3].map(i => {
        const r = 12 + i * 14;
        const start = -38;
        const end = 38;
        return (
          <path key={i}
            d={`M ${r * Math.cos((start * Math.PI)/180)} ${r * Math.sin((start * Math.PI)/180)}
                A ${r} ${r} 0 0 1 ${r * Math.cos((end * Math.PI)/180)} ${r * Math.sin((end * Math.PI)/180)}`}
            fill="none"
            stroke={color}
            strokeWidth={3}
            strokeLinecap="round"
            opacity={0.35 + (3 - i) * 0.22}
          />
        );
      })}
    </g>
  );
}

// ============================================================
// Pulse rings (room tone) — used as a backdrop motif
// ============================================================
function PulseRingsBg({ cx, cy, color = A.OLIVE, count = 5, maxR = 280 }) {
  return (
    <g>
      {Array.from({ length: count }, (_, i) => {
        const t = (i + 1) / (count + 0.5);
        const r = maxR * t;
        return (
          <circle key={i} cx={cx} cy={cy} r={r}
            fill="none" stroke={color}
            strokeWidth={1 + (1 - t) * 1.5}
            opacity={0.1 + (1 - t) * 0.4} />
        );
      })}
    </g>
  );
}

Object.assign(window, { A, Echo, SoundFromRostrum, PulseRingsBg });
