// Freestyle — Alternatives for the top of the Timeline page.
// Compares 4 different concepts side-by-side, so user can pick.

function TopAlternativesArtboard() {
  return (
    <div style={{
      width: '100%', height: '100%', background: R.CANVAS,
      padding: 48, boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', gap: 22, overflow: 'hidden',
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div>
          <Eyebrow text="Top of Timeline — alternatives" />
          <h1 style={{ margin: '8px 0 4px' }}>
            <span className="serif" style={{ fontSize: 36, color: R.INK, lineHeight: 1, letterSpacing:'-0.02em', fontWeight: 400 }}>What goes </span>
            <span className="serif-italic" style={{ fontSize: 36, color: R.OLIVE, lineHeight: 1 }}>above the timeline?</span>
          </h1>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: R.MUTE, maxWidth: 660 }}>
            Four directions. Pick one — or combine. Each is shown as it would sit in the page (sidebar + right rail trimmed for clarity).
          </p>
        </div>
        <span className="mono" style={{ fontSize: 11, color: R.MUTE, letterSpacing:'0.16em', textTransform:'uppercase' }}>
          Choose 1 — or stack
        </span>
      </div>

      <div style={{
        flex: 1, display:'grid', gridTemplateColumns: '1fr 1fr', gap: 16, minHeight: 0,
      }}>
        <AltSlot tag="A" name="Day Arc" desc="A short narrative essay of the day + WPM line chart. Most editorial.">
          <DayArcBlock />
        </AltSlot>
        <AltSlot tag="B" name="Streak" desc="Habit / momentum. Day count + 7-day session bars.">
          <StreakBlock />
        </AltSlot>
        <AltSlot tag="C" name="Now" desc="Action-oriented. Live mic, last paste, big hotkey. No metrics — just go.">
          <NowBlock />
        </AltSlot>
        <AltSlot tag="D" name="Themes" desc="What you talked about today, as tappable chips. Filters the timeline below.">
          <ThemesBlock />
        </AltSlot>
      </div>
    </div>
  );
}

// ============================================================
// E — TUTORIAL · Interactive how-to with animated fn key + live wave
// ============================================================
// Loops through 3 phases: idle → pressed (wave animates) → result (text appears).
// Cycles forever so a new visitor always sees the loop in motion.
function TutorialDemo({ big = false }) {
  const [phase, setPhase] = React.useState('idle');
  const [wavePts, setWavePts] = React.useState('');

  // Phase cycling
  React.useEffect(() => {
    let cancelled = false;
    const steps = [
      ['idle',    1800],
      ['pressed', 3600],
      ['result',  2400],
    ];
    let i = 0;
    let timeoutId;
    const tick = () => {
      if (cancelled) return;
      const [name, dur] = steps[i % steps.length];
      setPhase(name);
      i++;
      timeoutId = setTimeout(tick, dur);
    };
    tick();
    return () => { cancelled = true; clearTimeout(timeoutId); };
  }, []);

  // Wave animation
  const W = big ? 520 : 320;
  const H = big ? 60 : 40;
  React.useEffect(() => {
    let rafId;
    if (phase !== 'pressed') {
      // calm flat-ish line
      const N = 60;
      const pts = [];
      for (let i = 0; i <= N; i++) {
        const x = (i / N) * W;
        const y = H / 2;
        pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      }
      setWavePts(pts.join(' '));
      return;
    }
    // organic voice-like wave
    let t = 0;
    const start = performance.now();
    const animate = () => {
      t = (performance.now() - start) / 1000;
      const N = 90;
      const pts = [];
      // slowly varying overall amplitude — "loudness envelope"
      const loudness = (0.6 + 0.4 * Math.sin(t * 1.3)) * (0.7 + 0.3 * Math.sin(t * 2.4 + 1));
      for (let i = 0; i <= N; i++) {
        const tt = i / N;
        const x = tt * W;
        // outer sine envelope tapers ends
        const envelope = Math.sin(Math.PI * tt);
        // two harmonics + slow drift
        const a = (H * 0.42) * loudness * envelope;
        const y = H / 2 +
          a * Math.sin(tt * 9 * Math.PI + t * 5.2) * 0.7 +
          a * Math.sin(tt * 17 * Math.PI - t * 3.1) * 0.25;
        pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      }
      setWavePts(pts.join(' '));
      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [phase, W, H]);

  const fz = (px) => big ? px : Math.round(px * 0.74);
  const pressed = phase === 'pressed';
  const showResult = phase === 'result';

  // The instructional text — same line, three highlight states
  const StepWord = ({ active, children, color = R.OLIVE }) => (
    <span className="serif-italic" style={{
      color: active ? color : R.MUTE,
      transition: 'color 0.25s ease',
    }}>{children}</span>
  );

  return (
    <div style={{
      display:'flex', flexDirection: 'column', alignItems:'center',
      gap: big ? 28 : 18, height: '100%',
    }}>
      {/* Instructional line — centered */}
      <div style={{ textAlign: 'center' }}>
        <div className="serif" style={{
          fontSize: fz(40), lineHeight: 1.05, color: R.INK, letterSpacing:'-0.02em',
          fontWeight: 400,
        }}>
          <StepWord active={phase === 'idle'}>Press</StepWord>
          {' '}
          <span style={{
            display:'inline-block', verticalAlign: 'middle',
            margin: big ? '0 10px' : '0 6px',
          }}>
            <FnKey pressed={pressed} size={fz(46)} />
          </span>
          <StepWord active={pressed}>, speak,</StepWord>
          {' '}
          <StepWord active={showResult}>release.</StepWord>
        </div>
      </div>

      {/* Wave + transcript card */}
      <div style={{
        width: '100%', maxWidth: big ? '100%' : 560,
        background: pressed ? R.OLIVE_SOFT : R.PAPER,
        border: `1px solid ${pressed ? R.OLIVE : R.RULE}`,
        borderRadius: 12, padding: big ? '20px 24px' : '14px 18px',
        transition: 'background 0.25s ease, border-color 0.25s ease',
        display:'flex', flexDirection:'column', justifyContent:'center', gap: 8,
        position:'relative', overflow:'hidden',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap: 10 }}>
          <span style={{
            width: 7, height: 7, borderRadius:'50%',
            background: pressed ? R.OLIVE : R.MUTE,
            opacity: pressed ? 1 : 0.4,
            transition: 'all 0.2s ease',
            animation: pressed ? 'tdot 1.6s infinite ease-in-out' : 'none',
          }} />
          <span className="mono" style={{
            fontSize: 10, letterSpacing:'0.16em', textTransform:'uppercase',
            color: pressed ? R.OLIVE_DEEP : R.MUTE, fontWeight: 600,
            transition: 'color 0.2s ease',
          }}>
            {phase === 'idle' ? 'Ready' : pressed ? 'Listening · 0:0' + Math.min(3, Math.floor((Date.now()/1000)%4)) : 'Pasted to Slack'}
          </span>
          <style>{`@keyframes tdot { 0%,100%{transform:scale(1);opacity:1} 50%{transform:scale(1.4);opacity:0.5} }`}</style>
        </div>

        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" style={{ display:'block' }}>
          <polyline
            points={wavePts}
            fill="none"
            stroke={pressed ? R.OLIVE_DEEP : R.MUTE}
            strokeWidth={pressed ? 2 : 1.3}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transition: 'stroke 0.2s ease, stroke-width 0.2s ease' }}
          />
        </svg>

        {/* Result text — fades in during release phase */}
        <div style={{
          opacity: showResult ? 1 : 0,
          transform: showResult ? 'translateY(0)' : 'translateY(4px)',
          transition: 'opacity 0.35s ease, transform 0.35s ease',
          minHeight: big ? 26 : 18,
        }}>
          <span className="serif" style={{
            fontSize: fz(17), color: R.INK, lineHeight: 1.4, fontWeight: 450,
          }}>
            “Pushing the meeting to tomorrow at ten.”
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// FN KEY — animated keycap that depresses on `pressed`
// ============================================================
function FnKey({ pressed, size = 46 }) {
  const w = size * 1.05;
  const h = size * 0.9;
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', justifyContent:'center',
      width: w, height: h,
      borderRadius: size * 0.18,
      background: pressed ? R.OLIVE_SOFT : R.ELEVATED,
      border: `1.5px solid ${pressed ? R.OLIVE : R.RULE}`,
      borderBottomWidth: pressed ? 1.5 : Math.max(2, size * 0.075),
      color: pressed ? R.OLIVE_INK : R.INK,
      fontFamily: 'JetBrains Mono',
      fontSize: size * 0.4,
      fontWeight: 600,
      letterSpacing: '0.04em',
      transform: pressed ? `translateY(${size * 0.04}px)` : 'translateY(0)',
      boxShadow: pressed
        ? `inset 0 -1px 0 rgba(20,12,4,0.06), 0 0 0 6px ${R.OLIVE_SOFT}55`
        : `0 1px 0 ${R.RULE}, 0 2px 2px -1px rgba(20,12,4,0.06)`,
      transition: 'all 0.18s cubic-bezier(0.3, 0.7, 0.4, 1)',
      verticalAlign: 'middle',
    }}>
      fn
    </span>
  );
}

// ============================================================
// Tutorial — full-size artboard (animation runs in context)
// ============================================================
function TutorialArtboard() {
  return (
    <div style={{
      width: '100%', height: '100%', background: R.CANVAS,
      padding: 56, boxSizing:'border-box',
      display:'flex', flexDirection:'column', gap: 24,
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <Eyebrow text="Top of Timeline · variant E — interactive tutorial" />
        <span className="mono" style={{ fontSize: 11, color: R.MUTE, letterSpacing:'0.16em', textTransform:'uppercase' }}>
          Auto-loops · idle → pressed → release
        </span>
      </div>

      {/* The "how to use" block — as it would sit at the top of the Timeline */}
      <div style={{
        background: R.ELEVATED, border: `1px solid ${R.RULE}`, borderRadius: 16,
        padding: 36, marginTop: 8,
      }}>
        <TutorialDemo big />
      </div>

      {/* Notes */}
      <div style={{
        display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap: 14, marginTop: 6,
      }}>
        <NoteCard num="01" title="Real key animation"
          body="The fn keycap depresses with a CSS transform + reduced bottom border on press. Looks like a real keyboard." />
        <NoteCard num="02" title="Live wave"
          body="During 'pressed', the sine wave updates every animation frame from a sine-envelope×harmonics function — looks like real voice activity." />
        <NoteCard num="03" title="Result fades in"
          body="On release, the transcript appears with a small translate+opacity transition. The whole loop is 7.8s." />
      </div>

      <div style={{
        marginTop: 'auto', fontSize: 13, color: R.MUTE, lineHeight: 1.5, maxWidth: 720,
      }}>
        Best used on the empty Today page — once you have transcripts, the tutorial can shrink or be dismissed.
        Optional refinement: wire it to the real mic when permission is granted, so the wave reflects actual speech.
      </div>
    </div>
  );
}

function NoteCard({ num, title, body }) {
  return (
    <div style={{
      background: R.PAPER, border: `1px solid ${R.RULE}`, borderRadius: 12,
      padding: '14px 16px', display:'flex', flexDirection:'column', gap: 6,
    }}>
      <div className="mono" style={{ fontSize: 10, color: R.OLIVE, letterSpacing:'0.18em' }}>{num}</div>
      <div style={{ fontSize: 13.5, color: R.INK, fontWeight: 500 }}>{title}</div>
      <p style={{ margin: 0, fontSize: 12, color: R.MUTE, lineHeight: 1.5 }}>{body}</p>
    </div>
  );
}

Object.assign(window, { TopAlternativesArtboard, TutorialDemo, TutorialArtboard, FnKey });

function AltSlot({ tag, name, desc, children }) {
  return (
    <div style={{
      background: R.PAPER, border: `1px solid ${R.RULE}`, borderRadius: 14,
      padding: 18, display:'flex', flexDirection:'column', gap: 12, minHeight: 0, overflow:'hidden',
    }}>
      <div style={{ display:'flex', alignItems:'baseline', gap: 10 }}>
        <span className="mono" style={{
          fontSize: 11, color: R.OLIVE, letterSpacing:'0.2em', fontWeight: 600,
        }}>{tag}</span>
        <span style={{ fontSize: 15, color: R.INK, fontWeight: 500 }}>{name}</span>
        <span style={{ flex: 1 }} />
        <span style={{ fontSize: 11.5, color: R.MUTE, maxWidth: 280, textAlign:'right', lineHeight: 1.4 }}>
          {desc}
        </span>
      </div>
      <div style={{
        flex: 1, background: R.CANVAS, border: `1px solid ${R.RULE_SOFT}`, borderRadius: 10,
        padding: 18, overflow:'hidden',
      }}>
        {children}
      </div>
    </div>
  );
}

// ============================================================
// A — DAY ARC
// ============================================================
function DayArcBlock() {
  // Mini WPM-by-hour line chart
  const wpmByHour = [0,0,0,0,0,0,0,120,130,140,128,150,144,138,162,150,176,168,148,138,158,162,0,0];
  return (
    <div style={{ display:'grid', gridTemplateColumns:'1.4fr 1fr', gap: 22, height: '100%' }}>
      <div style={{ display:'flex', flexDirection:'column', justifyContent:'center' }}>
        <div className="mono" style={{ fontSize: 10, color: R.OLIVE, letterSpacing:'0.18em', textTransform:'uppercase', marginBottom: 10 }}>
          Your day · so far
        </div>
        <p className="serif" style={{
          margin: 0, fontSize: 20, color: R.INK, lineHeight: 1.45, fontWeight: 450, textWrap:'pretty',
        }}>
          Six sessions across the evening — mostly Slack and a long Gmail to Maria.
          Your fastest stretch was at <span className="serif-italic" style={{ color: R.OLIVE }}>9:30 pm</span>,
          peaking at <span className="serif-italic" style={{ color: R.OLIVE }}>176 wpm</span>.
        </p>
      </div>
      <div style={{ display:'flex', flexDirection:'column', justifyContent:'center', gap: 10 }}>
        <div className="mono" style={{ fontSize: 10, color: R.MUTE, letterSpacing:'0.16em', textTransform:'uppercase' }}>
          WPM · across the day
        </div>
        <WpmLine data={wpmByHour} />
      </div>
    </div>
  );
}

function WpmLine({ data }) {
  const W = 220, H = 80;
  const max = Math.max(...data) || 1;
  const visible = data.map((v, i) => ({ v, i })).filter(d => d.v > 0);
  if (visible.length < 2) return null;
  const first = visible[0].i;
  const last = visible[visible.length - 1].i;
  const span = last - first || 1;
  const pts = visible.map(d => {
    const x = ((d.i - first) / span) * W;
    const y = H - (d.v / max) * (H - 8) - 4;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H + 14}`} width="100%" height={H + 14} style={{ overflow:'visible' }}>
      <line x1="0" y1={H - 0.5} x2={W} y2={H - 0.5} stroke={R.RULE} strokeWidth="1" />
      <polyline points={pts} fill="none" stroke={R.OLIVE} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {visible.map(d => {
        const x = ((d.i - first) / span) * W;
        const y = H - (d.v / max) * (H - 8) - 4;
        return <circle key={d.i} cx={x} cy={y} r="2" fill={R.OLIVE} />;
      })}
      <text x="0" y={H + 12} fontFamily="JetBrains Mono" fontSize="9" fill={R.MUTE}>7am</text>
      <text x={W} y={H + 12} fontFamily="JetBrains Mono" fontSize="9" fill={R.MUTE} textAnchor="end">11pm</text>
    </svg>
  );
}

// ============================================================
// B — STREAK
// ============================================================
function StreakBlock() {
  const last7 = [4, 6, 2, 8, 5, 7, 6]; // sessions per day
  const max = Math.max(...last7);
  return (
    <div style={{ display:'flex', alignItems:'center', gap: 24, height: '100%' }}>
      <div style={{ flexShrink: 0 }}>
        <div className="mono" style={{ fontSize: 10, color: R.OLIVE, letterSpacing:'0.18em', textTransform:'uppercase', marginBottom: 6 }}>
          Streak
        </div>
        <div style={{ display:'flex', alignItems:'baseline', gap: 8 }}>
          <span className="serif-italic" style={{ fontSize: 100, lineHeight: 0.9, color: R.INK, letterSpacing:'-0.025em' }}>47</span>
          <span style={{ fontSize: 14, color: R.MUTE }}>days</span>
        </div>
        <p style={{ margin: '8px 0 0', fontSize: 13, color: R.MUTE, lineHeight: 1.4, maxWidth: 200 }}>
          Talking on Freestyle every day since <span style={{ color: R.INK_SOFT, fontWeight: 500 }}>April 11</span>.
        </p>
      </div>
      <div style={{ flex: 1, display:'flex', flexDirection:'column', gap: 8, justifyContent:'center' }}>
        <div className="mono" style={{ fontSize: 10, color: R.MUTE, letterSpacing:'0.16em', textTransform:'uppercase' }}>
          Sessions · last 7 days
        </div>
        <div style={{ display:'flex', alignItems:'flex-end', gap: 6, height: 70 }}>
          {last7.map((v, i) => (
            <div key={i} style={{
              flex: 1, height: `${(v / max) * 100}%`,
              background: i === last7.length - 1 ? R.OLIVE : R.OLIVE_SOFT,
              border: `1px solid ${i === last7.length - 1 ? R.OLIVE_DEEP : R.OLIVE_DEEP+'33'}`,
              borderRadius: 4,
            }} />
          ))}
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize: 9, color: R.MUTE, fontFamily:'JetBrains Mono', letterSpacing:'0.06em' }}>
          {['F','S','S','M','T','W','T'].map((d, i) => (
            <span key={i} style={{ flex: 1, textAlign:'center' }}>{d}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================================
// C — NOW (live status)
// ============================================================
function NowBlock() {
  return (
    <div style={{ display:'flex', alignItems:'center', gap: 22, height: '100%' }}>
      <div style={{ flex: 1 }}>
        <div style={{ display:'flex', alignItems:'center', gap: 10, marginBottom: 8 }}>
          <span style={{ width: 8, height: 8, borderRadius:'50%', background: R.OLIVE,
            boxShadow: `0 0 0 4px ${R.OLIVE_SOFT}`, }} />
          <span className="mono" style={{ fontSize: 10.5, color: R.OLIVE_DEEP, letterSpacing:'0.18em', fontWeight: 600 }}>
            READY · whisper-v3-turbo
          </span>
        </div>
        <h2 style={{ margin: '0 0 8px' }}>
          <span className="serif-italic" style={{ fontSize: 38, color: R.INK, lineHeight: 1, letterSpacing:'-0.015em' }}>Ready when you are.</span>
        </h2>
        <div style={{ fontSize: 13, color: R.MUTE }}>
          Last paste · <span style={{ color: R.INK_SOFT }}>2 minutes ago to Slack</span>
        </div>
      </div>
      <div style={{
        background: R.PAPER, border: `1px solid ${R.RULE}`, borderRadius: 10,
        padding: '14px 18px', display:'flex', flexDirection:'column', alignItems:'center', gap: 8,
      }}>
        <div style={{ display:'flex', gap: 5 }}>
          <Kbd big>⌥</Kbd>
          <Kbd big>Space</Kbd>
        </div>
        <span className="mono" style={{ fontSize: 9.5, color: R.MUTE, letterSpacing:'0.14em' }}>HOLD TO TALK</span>
      </div>
    </div>
  );
}

// ============================================================
// D — THEMES
// ============================================================
function ThemesBlock() {
  const themes = [
    { label: 'engineering', count: 4 },
    { label: 'meetings',    count: 3 },
    { label: 'planning',    count: 2 },
    { label: 'personal',    count: 2 },
    { label: 'bug reports', count: 1 },
  ];
  return (
    <div style={{ display:'flex', flexDirection:'column', justifyContent:'center', gap: 14, height: '100%' }}>
      <div className="mono" style={{ fontSize: 10, color: R.OLIVE, letterSpacing:'0.18em', textTransform:'uppercase' }}>
        Today's themes
      </div>
      <p className="serif" style={{
        margin: 0, fontSize: 18, color: R.INK_SOFT, lineHeight: 1.4, fontWeight: 450,
      }}>
        Mostly <span style={{ color: R.OLIVE, fontWeight: 500 }}>engineering</span> today —
        a few meetings, a quick reminder, and one bug.
      </p>
      <div style={{ display:'flex', flexWrap:'wrap', gap: 6 }}>
        {themes.map((t, i) => (
          <span key={t.label} style={{
            display:'inline-flex', alignItems:'center', gap: 6,
            padding: '5px 10px',
            background: i === 0 ? R.OLIVE_SOFT : R.PAPER,
            border: `1px solid ${i === 0 ? R.OLIVE : R.RULE}`,
            color: i === 0 ? R.OLIVE_INK : R.INK_SOFT,
            borderRadius: 999, fontSize: 12,
            fontWeight: i === 0 ? 500 : 400,
          }}>
            {t.label}
            <span className="mono" style={{ fontSize: 9.5, color: i === 0 ? R.OLIVE_DEEP : R.MUTE }}>×{t.count}</span>
          </span>
        ))}
      </div>
      <div className="mono" style={{ fontSize: 10, color: R.MUTE, letterSpacing:'0.06em' }}>
        tap to filter the timeline below ↓
      </div>
    </div>
  );
}

Object.assign(window, { TopAlternativesArtboard, TutorialDemo, TutorialArtboard, FnKey });
