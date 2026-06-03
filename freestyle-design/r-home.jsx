// Freestyle — Home page explorations.
//
// Three sketches of a "Today" / Home page — minimalist, editorial, and
// content-first. All three share: a day-summary header, metrics including
// words-per-minute, and the actual transcripts of conversations today.

// ============================================================
// Shared mock data — same transcripts across all 3 sketches
// ============================================================
const TODAY = [
{ time: '11:42 pm', app: 'Slack', duration: 14, words: 38, wpm: 162, model: 'whisper · gpt-4o-mini',
  text: "Could you push the meeting from two to three? Actually, let's make it tomorrow at ten — easier on everyone." },
{ time: '10:14 pm', app: 'Notes', duration: 6, words: 11, wpm: 110, model: 'whisper',
  text: "Reminder: grab the dry cleaning before seven — Tuesday night, not Wednesday." },
{ time: '9:30 pm', app: 'Linear', duration: 22, words: 56, wpm: 152, model: 'whisper · gpt-4o-mini',
  text: "Bug: the pill shows 'pasted' even when the clipboard write failed. Repro: deny accessibility permission, hold hotkey, release. We should surface the actual error instead of a false success." },
{ time: '6:21 pm', app: 'iMessage', duration: 4, words: 9, wpm: 135, model: 'whisper',
  text: "Running ten minutes late, sorry — order me whatever." },
{ time: '3:08 pm', app: 'Gmail', duration: 38, words: 112, wpm: 176, model: 'nova-3 · claude',
  text: "Hi Maria, thanks for the update on the renderer migration. I'd like to dig into the performance numbers a bit more before we commit to shipping next sprint — particularly the cold-start regression on Windows. Could we set up time on Thursday?" },
{ time: '1:14 pm', app: 'Cursor', duration: 19, words: 41, wpm: 130, model: 'whisper',
  text: "Function takes an audio buffer, returns a promise that resolves to the transcript string. Throw if the buffer is shorter than five hundred milliseconds." }];


const DAY_TOTALS = {
  words: 1284,
  sessions: 38,
  wpm: 148,
  topApp: 'Slack',
  topAppPct: 38,
  cost: 0.12,
  duration: 612 // seconds of voice
};

// Per-hour activity (24h, mock) — used by sketches that show a sparkline
const HOURLY = [
0, 0, 0, 0, 0, 0, 0, 4, 8, 12, 6, 18, 24, 14, 9, 16, 22, 28, 14, 8, 6, 18, 0, 0];


// ============================================================
// PROPOSITION CARD — a thinking-out-loud note
// ============================================================
function HomeProposition() {
  return (
    <div style={{
      width: '100%', height: '100%', background: R.CANVAS,
      padding: 56, boxSizing: 'border-box', display: 'flex', flexDirection: 'column', gap: 18,
      position: 'relative'
    }}>
      <Eyebrow text="Home — proposition" />

      <h1 style={{ margin: '0' }}>
        <span className="serif" style={{ fontSize: 76, lineHeight: 0.92, letterSpacing: '-0.03em', color: R.INK, fontWeight: 400 }}>The home page is </span>
        <span className="serif-italic" style={{ fontSize: 76, lineHeight: 0.92, color: R.OLIVE }}>today's voice.</span>
      </h1>

      <p style={{ margin: 0, fontSize: 18, color: R.INK_SOFT, lineHeight: 1.55, maxWidth: 760, textWrap: 'pretty' }}>
        Most dictation apps drop you into a settings screen, or a blank "ready" panel.
        Freestyle should do the opposite — open straight into a printed record of what you said today, the way a writer flips open their notebook.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18, marginTop: 26 }}>
        <PropPoint num="01" title="Day summary up top"
        body="Words spoken, average WPM, sessions, top app, cost. Italic-serif numerals so it reads like a paper masthead, not a dashboard." />
        <PropPoint num="02" title="The script below"
        body="Every transcript today, in order, formatted like a screenplay: timestamp + app on one line, then the italic-serif quote. Read your day back, top to bottom." />
        <PropPoint num="03" title="No clutter"
        body="One subtle action per card (copy / reuse). Search and filters are progressive disclosure. Settings live elsewhere — this is reading material." />
      </div>

      <p style={{ margin: '18px 0 0', fontSize: 14, color: R.MUTE, lineHeight: 1.5, maxWidth: 760, textWrap: 'pretty' }}>
        Three sketches follow. They all share the day-summary header and italic-serif transcripts — they differ in <strong style={{ color: R.INK_SOFT, fontWeight: 600 }}>how dense</strong> and <strong style={{ color: R.INK_SOFT, fontWeight: 600 }}>how chronological</strong> the layout gets.
      </p>
    </div>);

}

function PropPoint({ num, title, body }) {
  return (
    <div style={{
      background: R.ELEVATED, border: `1px solid ${R.RULE}`, borderRadius: 12,
      padding: '18px 20px', display: 'flex', flexDirection: 'column', gap: 8
    }}>
      <div className="mono" style={{ fontSize: 10, color: R.OLIVE, letterSpacing: '0.18em', textTransform: 'uppercase' }}>{num}</div>
      <div style={{ fontSize: 15, fontWeight: 500, color: R.INK }}>{title}</div>
      <p style={{ margin: 0, fontSize: 13, color: R.MUTE, lineHeight: 1.55, textWrap: 'pretty' }}>{body}</p>
    </div>);

}

// ============================================================
// Home pages use the canonical SidebarA. (Old local SidebarHome removed.)
// ============================================================

// ============================================================
// SKETCH A — THE DAILY SCRIPT
// ============================================================
// Editorial masthead, then transcripts as screenplay-style entries.
// Timestamps in the left margin, app caps, italic-serif body.
function HomeScriptScreen() {
  return (
    <MacWindow title="Freestyle — Today">
      <SidebarA active="today" />
      <main style={{ flex: 1, padding: '36px 56px 48px', overflow: 'auto', background: R.CANVAS, position: 'relative' }}>

        {/* Masthead row */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, marginBottom: 8 }}>
          <span className="mono" style={{ fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: R.MUTE }}>
            Thursday · May 28
          </span>
          <span style={{ flex: 1, height: 1, background: R.INK, marginBottom: 5 }} />
          <span className="mono" style={{ fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: R.MUTE }}>
            Issue №1,247
          </span>
        </div>
        <div style={{ height: 3, background: R.INK, marginBottom: 28 }} />

        {/* Hero — day in a phrase */}
        <h1 style={{ margin: '0 0 32px' }}>
          <span className="serif" style={{ fontSize: 64, color: R.INK, lineHeight: 0.95, letterSpacing: '-0.025em', fontWeight: 400 }}>You said </span>
          <span className="serif-italic" style={{ fontSize: 64, color: R.OLIVE, lineHeight: 0.95 }}>1,284 words </span>
          <span className="serif" style={{ fontSize: 64, color: R.INK, lineHeight: 0.95, letterSpacing: '-0.025em', fontWeight: 400 }}>today.</span>
        </h1>

        {/* Day metrics strip */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 0,
          paddingBottom: 28, borderBottom: `1px solid ${R.RULE}`, marginBottom: 32
        }}>
          <MastheadMetric n="38" l="sessions" />
          <MastheadMetric n="10:12" l="minutes spoken" />
          <MastheadMetric n="148" l="avg wpm" accent />
          <MastheadMetric n="Slack" l="top app · 38%" />
          <MastheadMetric n="$0.12" l="cost today" right />
        </div>

        {/* The script */}
        <div className="mono" style={{ fontSize: 10, color: R.MUTE, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 18 }}>
          The script
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {TODAY.map((t, i) => <ScriptEntry key={i} {...t} />)}
        </div>

        <div style={{ textAlign: 'center', marginTop: 32, padding: '20px 0', borderTop: `1px solid ${R.RULE}` }}>
          <span className="serif-italic" style={{ fontSize: 22, color: R.MUTE }}>— end of day —</span>
        </div>
      </main>
    </MacWindow>);

}

function MastheadMetric({ n, l, accent, right }) {
  return (
    <div style={{ padding: '0 0', textAlign: right ? 'right' : 'left' }}>
      <div className="serif-italic" style={{
        fontSize: 40, lineHeight: 1, color: accent ? R.OLIVE : R.INK, letterSpacing: '-0.01em'
      }}>{n}</div>
      <div className="mono" style={{
        fontSize: 10, marginTop: 8, color: R.MUTE, letterSpacing: '0.14em', textTransform: 'uppercase'
      }}>{l}</div>
    </div>);

}

function ScriptEntry({ time, app, duration, words, wpm, model, text }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '120px 1fr', gap: 32,
      padding: '20px 0', borderBottom: `1px solid ${R.RULE_SOFT}`
    }}>
      {/* Margin: time + app + small stats */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 4 }}>
        <div className="mono" style={{ fontSize: 12, color: R.INK, fontWeight: 500, letterSpacing: '0.04em' }}>{time}</div>
        <div className="mono" style={{ fontSize: 10.5, color: R.OLIVE, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{app}</div>
        <div style={{ height: 1, background: R.RULE_SOFT, margin: '4px 0' }} />
        <div className="mono" style={{ fontSize: 10, color: R.MUTE, letterSpacing: '0.04em', lineHeight: 1.6 }}>
          {duration}s · {words} wds<br />
          {wpm} wpm
        </div>
      </div>
      {/* Body */}
      <div>
        <p className="serif" style={{
          margin: 0, fontSize: 21, color: R.INK, lineHeight: 1.55, textWrap: 'pretty', fontWeight: 450
        }}>
          “{text}”
        </p>
      </div>
    </div>);

}

// ============================================================
// SKETCH B — THE EDITOR'S DESK (hero + recent)
// ============================================================
// One big italic moment up top, sparkline of activity, then 3-4 recent
// transcripts as full cards. Less to read at a glance — easier to scan.
function HomeDeskScreen() {
  return (
    <MacWindow title="Freestyle — Today">
      <SidebarA active="today" />
      <main style={{ flex: 1, padding: '40px 56px 48px', overflow: 'auto', background: R.CANVAS }}>

        {/* Eyebrow */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <Eyebrow text="Thursday, May 28" />
          <span className="mono" style={{ fontSize: 11, color: R.MUTE, letterSpacing: '0.14em' }}>
            DAY 1,247 · ON FREESTYLE
          </span>
        </div>

        {/* HERO — big metric card */}
        <div style={{
          background: R.ELEVATED, border: `1px solid ${R.RULE}`, borderRadius: 16,
          padding: '38px 40px', marginBottom: 28,
          display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 36, alignItems: 'center'
        }}>
          {/* left — the big number */}
          <div>
            <div className="mono" style={{ fontSize: 11, color: R.OLIVE, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 12 }}>
              Words spoken today
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
              <span className="serif-italic" style={{ fontSize: 140, lineHeight: 0.88, color: R.INK, letterSpacing: '-0.025em' }}>1,284</span>
              <span style={{ fontSize: 16, color: R.MUTE }}>↑ 18% vs yesterday</span>
            </div>
            <div className="serif-italic" style={{ fontSize: 26, color: R.INK_SOFT, marginTop: 18, lineHeight: 1.3, maxWidth: 460, textWrap: 'pretty' }}>
              "Six sessions, an even mix of Slack and Linear, mostly between 1pm and midnight."
            </div>
          </div>

          {/* right — hourly sparkline + small stats */}
          <div style={{ borderLeft: `1px solid ${R.RULE}`, paddingLeft: 36 }}>
            <div className="mono" style={{ fontSize: 10, color: R.MUTE, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 12 }}>
              Activity · 24h
            </div>
            <HourSpark data={HOURLY} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 22 }}>
              <DeskStat n="148" l="avg wpm" accent />
              <DeskStat n="38" l="sessions" />
              <DeskStat n="10:12" l="min spoken" />
              <DeskStat n="$0.12" l="cost" />
            </div>
          </div>
        </div>

        {/* RECENT — last 3 transcripts as featured cards, then a "more" link */}
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 className="serif-italic" style={{ margin: 0, fontSize: 26, color: R.INK, lineHeight: 1 }}>Recent</h2>
          <span className="mono" style={{ fontSize: 10.5, color: R.MUTE, letterSpacing: '0.12em' }}>
            6 transcripts · search ⌘K
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {TODAY.slice(0, 3).map((t, i) => <DeskCard key={i} {...t} featured={i === 0} />)}
          <button style={{
            background: 'transparent', border: `1px dashed ${R.RULE}`, color: R.MUTE,
            padding: '12px 18px', borderRadius: 10, fontSize: 13, cursor: 'pointer'
          }}>
            View 3 earlier transcripts →
          </button>
        </div>
      </main>
    </MacWindow>);

}

function DeskStat({ n, l, accent }) {
  return (
    <div>
      <div className="serif-italic" style={{ fontSize: 32, lineHeight: 1, color: accent ? R.OLIVE : R.INK }}>{n}</div>
      <div className="mono" style={{ fontSize: 10, color: R.MUTE, letterSpacing: '0.14em', textTransform: 'uppercase', marginTop: 4 }}>{l}</div>
    </div>);

}

// Tiny hour-by-hour sparkline using SVG bars
function HourSpark({ data }) {
  const W = 280,H = 64;
  const max = Math.max(...data);
  const barW = W / data.length;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} style={{ overflow: 'visible' }}>
      {/* baseline */}
      <line x1="0" y1={H - 0.5} x2={W} y2={H - 0.5} stroke={R.RULE} strokeWidth="1" />
      {data.map((v, i) => {
        const h = max ? v / max * (H - 6) : 0;
        const x = i * barW + barW * 0.18;
        return (
          <rect key={i}
          x={x} y={H - h - 1}
          width={barW * 0.64} height={Math.max(1, h)}
          fill={v === 0 ? R.RULE : R.OLIVE} opacity={v === 0 ? 0.4 : 0.85}
          rx="1" />);


      })}
      {/* tick labels */}
      {[0, 6, 12, 18, 23].map((t) =>
      <text key={t} x={(t + 0.5) * barW} y={H + 12}
      fontFamily="JetBrains Mono" fontSize="9" fill={R.MUTE} textAnchor="middle">
          {t === 23 ? '24' : String(t).padStart(2, '0')}
        </text>
      )}
    </svg>);

}

function DeskCard({ time, app, duration, words, wpm, model, text, featured }) {
  return (
    <div style={{
      background: featured ? R.ELEVATED : 'transparent',
      border: featured ? `1px solid ${R.RULE}` : `1px solid ${R.RULE_SOFT}`,
      borderRadius: 12, padding: '16px 20px'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <span className="mono" style={{ fontSize: 11, color: R.INK, fontWeight: 500, letterSpacing: '0.04em' }}>{time}</span>
        <span style={{ width: 3, height: 3, borderRadius: '50%', background: R.MUTE }} />
        <span className="mono" style={{ fontSize: 10.5, color: R.OLIVE, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{app}</span>
        <span style={{ flex: 1 }} />
        <span className="mono" style={{ fontSize: 10.5, color: R.MUTE, letterSpacing: '0.06em' }}>{wpm} wpm · {duration}s · {words} wds</span>
      </div>
      <p className="serif" style={{
        margin: 0, fontSize: featured ? 22 : 18, color: R.INK, lineHeight: 1.5, textWrap: 'pretty', fontWeight: 450
      }}>
        “{text}”
      </p>
    </div>);

}

// ============================================================
// SKETCH C — THE TIMELINE
// ============================================================
// Vertical hour-rail down the left; sessions pinned to the time they happened.
// Feels like an audio editor. Day summary lives in a slim right rail.
function HomeTimelineScreen() {
  return (
    <MacWindow title="Freestyle — Today">
      <SidebarA active="today" />
      <main style={{ flex: 1, display: 'flex', minHeight: 0, background: R.CANVAS }}>
        {/* Center — the timeline */}
        <div style={{ flex: 1, display:'flex', flexDirection:'column', minHeight: 0 }}>
          <div style={{ flex: 1, padding: '36px 36px 24px', overflow: 'auto' }}>

            {/* TUTORIAL · animated how-to */}
            <div style={{
              background: R.ELEVATED, border: `1px solid ${R.RULE}`, borderRadius: 14,
              padding: '22px 26px', marginBottom: 32,
            }}>
              <TutorialDemo />
            </div>

            {/* Timeline label */}
            <div className="mono" style={{ fontSize: 10, color: R.MUTE, letterSpacing: '0.2em', textTransform:'uppercase', marginBottom: 22 }}>
              The timeline · 6 sessions
            </div>

            {/* Timeline list — reverse-chronological, latest at top */}
            <div style={{ position: 'relative', paddingLeft: 100 }}>
            {/* vertical rule */}
            <div style={{
              position: 'absolute', top: 0, bottom: 0, left: 75, width: 1, background: R.RULE
            }} />
            {/* open slot cap — the next, future session */}
            <div style={{ position: 'relative', marginBottom: 20 }}>
              <span style={{
                position: 'absolute', left: -30, top: 4, width: 10, height: 10, borderRadius: '50%',
                background: R.CANVAS, border: `1.5px dashed ${R.RULE}`
              }} />
              <span className="serif-italic" style={{ fontSize: 18, color: R.MUTE }}>ready when you are…</span>
            </div>
            {TODAY.map((t, i) => <TimelineNode key={i} {...t} />)}
          </div>
          </div>

          {/* RADIO WAVE removed */}
        </div>

        {/* Right rail — day summary */}
        <aside style={{
          width: 280, background: R.PAPER, borderLeft: `1px solid ${R.RULE}`,
          padding: '36px 28px', display: 'flex', flexDirection: 'column', gap: 26, flexShrink: 0
        }}>
          <div>
            <div className="mono" style={{ fontSize: 10, color: R.MUTE, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 12 }}>
              In numbers
            </div>
            <RailStat big n="1,284" l="words today" />
            <RailStat n="148" l="avg wpm" accent />
            <RailStat n="10:12" l="min spoken" />
          </div>

          <div>
            <div className="mono" style={{ fontSize: 10, color: R.MUTE, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 12 }}>
              Most used
            </div>
            <AppBar app="whisper" pct={58} />
            <AppBar app="gpt-4o-mini" pct={24} />
            <AppBar app="nova-3" pct={12} />
            <AppBar app="other" pct={6} muted />
          </div>

          <div>
            <div className="mono" style={{ fontSize: 10, color: R.MUTE, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 12 }}>
              Activity · 24h
            </div>
            <HourSpark data={HOURLY} />
          </div>
        </aside>
      </main>
    </MacWindow>);

}

function TimelineNode({ time, app, model, duration, words, wpm, text }) {
  return (
    <div style={{ position: 'relative', marginBottom: 18 }}>
      {/* dot */}
      <span style={{
        position: 'absolute', left: -30, top: 8, width: 10, height: 10, borderRadius: '50%',
        background: R.OLIVE, border: `2px solid ${R.CANVAS}`, boxShadow: `0 0 0 1px ${R.OLIVE}`
      }} />
      {/* time label */}
      <div style={{
        position: 'absolute', left: -100, top: 4, width: 60, textAlign: 'right'
      }}>
        <div className="mono" style={{ fontSize: 11, color: R.INK, fontWeight: 500, letterSpacing: '0.04em' }}>{time}</div>
      </div>

      {/* Card */}
      <div style={{
        background: R.ELEVATED, border: `1px solid ${R.RULE}`, borderRadius: 11,
        padding: '14px 18px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <span className="mono" style={{ fontSize: 10.5, color: R.OLIVE, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{model}</span>
          <span style={{ flex: 1 }} />
          <span className="mono" style={{ fontSize: 10.5, color: R.MUTE, letterSpacing: '0.04em' }}>
            {wpm} wpm · {duration}s · {words} wds
          </span>
        </div>
        <p className="serif" style={{
          margin: 0, fontSize: 17, color: R.INK, lineHeight: 1.5, textWrap: 'pretty', fontWeight: 450
        }}>
          “{text}”
        </p>
      </div>
    </div>);

}

function RailStat({ n, l, big, accent }) {
  return (
    <div style={{ marginBottom: big ? 16 : 12, display: 'flex', alignItems: 'baseline', gap: 10 }}>
      <span className="serif-italic" style={{
        fontSize: big ? 44 : 26, lineHeight: 1, color: accent ? R.OLIVE : R.INK,
        minWidth: 70
      }}>{n}</span>
      <span className="mono" style={{
        fontSize: 10, color: R.MUTE, letterSpacing: '0.12em', textTransform: 'uppercase', lineHeight: 1.3
      }}>{l}</span>
    </div>);

}

function AppBar({ app, pct, muted }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
      <span className="mono" style={{
        fontSize: 10.5, color: muted ? R.MUTE : R.INK, letterSpacing: '0.1em', textTransform: 'uppercase',
        width: 50, flexShrink: 0
      }}>{app}</span>
      <div style={{ flex: 1, height: 4, background: R.CANVAS, borderRadius: 999, overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`, height: '100%',
          background: muted ? R.MUTE : R.OLIVE,
          borderRadius: 999
        }} />
      </div>
      <span className="mono" style={{ fontSize: 10.5, color: R.MUTE, width: 30, textAlign: 'right' }}>{pct}%</span>
    </div>);

}

Object.assign(window, {
  HomeProposition, HomeScriptScreen, HomeDeskScreen, HomeTimelineScreen,
  HomeTimelineEmpty, RadioWave,
});

// ============================================================
// RadioWave — ambient, continuously-animated sine wave footer
// Three drifting harmonics → feels like a calm radio signal.
// ============================================================
function RadioWave({ height = 64, color, opacity = 0.7 }) {
  const c = color || R.OLIVE;
  const [pts, setPts] = React.useState('');
  React.useEffect(() => {
    let rafId;
    const start = performance.now();
    const animate = () => {
      const t = (performance.now() - start) / 1000;
      const W = 1200, H = height;
      const N = 240;
      const out = [];
      for (let i = 0; i <= N; i++) {
        const tt = i / N;
        const x = tt * W;
        const y = H / 2 +
          (H * 0.22) * Math.sin(tt * 4 * Math.PI + t * 1.1) +
          (H * 0.11) * Math.sin(tt * 11 * Math.PI - t * 0.7) +
          (H * 0.05) * Math.sin(tt * 23 * Math.PI + t * 1.9);
        out.push(`${x.toFixed(1)},${y.toFixed(1)}`);
      }
      setPts(out.join(' '));
      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(rafId);
  }, [height]);
  return (
    <div style={{
      flexShrink: 0,
      borderTop: `1px solid ${R.RULE_SOFT}`,
      background: R.CANVAS,
      padding: '14px 36px',
      position: 'relative', overflow: 'hidden',
    }}>
      <svg viewBox={`0 0 1200 ${height}`} preserveAspectRatio="none"
        width="100%" height={height}
        style={{ display:'block', overflow:'visible' }}>
        <polyline
          points={pts}
          fill="none"
          stroke={c}
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={opacity}
        />
      </svg>
    </div>
  );
}

// ============================================================
// HomeTimelineEmpty — when there are no transcripts yet today
// ============================================================
function HomeTimelineEmpty() {
  return (
    <MacWindow title="Freestyle — Today">
      <SidebarA active="today" />
      <main style={{ flex: 1, display: 'flex', minHeight: 0, background: R.CANVAS }}>
        {/* Center — empty moment */}
        <div style={{ flex: 1, display:'flex', flexDirection:'column', minHeight: 0 }}>
          <div style={{ flex: 1, padding: '36px 36px 24px', overflow:'auto', display:'flex', flexDirection:'column' }}>

            {/* TUTORIAL · headlines the empty state */}
            <div style={{
              background: R.ELEVATED, border: `1px solid ${R.RULE}`, borderRadius: 14,
              padding: '26px 28px', marginBottom: 36,
            }}>
              <TutorialDemo />
            </div>

            <div className="mono" style={{ fontSize: 10, color: R.MUTE, letterSpacing: '0.2em', textTransform:'uppercase', marginBottom: 22 }}>
              The timeline · 0 sessions
            </div>

            <div style={{
              flex: 1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
              paddingBottom: 40, textAlign:'center',
            }}>
              <div style={{
                width: 12, height: 12, borderRadius: '50%',
                background: R.CANVAS, border: `1.5px dashed ${R.RULE}`,
                marginBottom: 16,
              }} />
              <span className="serif-italic" style={{ fontSize: 22, color: R.MUTE, lineHeight: 1.3 }}>
                your day is unwritten — your first session will land here.
              </span>
            </div>
          </div>

          {/* RADIO WAVE removed */}
        </div>

        {/* Right rail — all placeholders */}
        <aside style={{
          width: 280, background: R.PAPER, borderLeft: `1px solid ${R.RULE}`,
          padding: '36px 28px', display: 'flex', flexDirection: 'column', gap: 26, flexShrink: 0
        }}>
          <div>
            <div className="mono" style={{ fontSize: 10, color: R.MUTE, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 12 }}>
              In numbers
            </div>
            <RailStat big n="—" l="words today" />
            <RailStat n="—"    l="avg wpm" />
            <RailStat n="0:00" l="min spoken" />
          </div>

          <div>
            <div className="mono" style={{ fontSize: 10, color: R.MUTE, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 12 }}>
              Most used
            </div>
            <div style={{
              padding: '14px 0', fontSize: 12, color: R.MUTE, fontStyle:'italic', lineHeight: 1.5,
            }}>
              No models yet. Models will appear here as you dictate.
            </div>
          </div>

          <div>
            <div className="mono" style={{ fontSize: 10, color: R.MUTE, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 12 }}>
              Activity · 24h
            </div>
            <HourSpark data={Array.from({length:24}, () => 0)} />
          </div>
        </aside>
      </main>
    </MacWindow>
  );
}