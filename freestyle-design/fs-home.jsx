// Freestyle landing — "Home" demo staging.
// Faithful to the App Redesign "Today" spec (no sidebar), shown beside a Notes
// editor so you can watch dictated text land in BOTH: logged in Freestyle's
// Today feed (left) and pasted into the editor at your cursor (right).
// A large recording pill sits below. Shares the demo state machine via props.

const HOME_FEED = [
  { time: '10:14 pm', app: 'Notes', duration: 6, words: 11, wpm: 110,
    text: 'Reminder: grab the dry cleaning before seven — Tuesday night.' },
  { time: '9:30 pm', app: 'Linear', duration: 22, words: 56, wpm: 152,
    text: 'Bug: the pill shows “pasted” even when the clipboard write failed.' },
];

function StageHome({ phase, typed, elapsed, accent, press, release }) {
  const settled = phase === 'done';
  const words = settled ? '1,295' : '1,284';
  const sessions = settled ? '39' : '38';
  return (
    <div style={{
      position: 'relative', borderRadius: 22, overflow: 'hidden',
      border: `1px solid ${FT.rule}`, maxWidth: 1080, margin: '0 auto',
      background: `linear-gradient(150deg, ${FT.paper} 0%, ${FT.canvas} 50%, #EBE5D2 100%)`,
      boxShadow: '0 30px 70px -34px rgba(20,12,4,0.4)',
      padding: 'clamp(26px,3.4vw,44px) clamp(22px,3vw,40px) 100px',
    }}>
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.5, pointerEvents: 'none',
        background: `radial-gradient(circle at 13% 15%, ${accent.soft}88, transparent 42%), radial-gradient(circle at 89% 86%, rgba(20,12,4,0.05), transparent 46%)`,
      }} />

      <div className="fs-home-grid" style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1.34fr 1fr', gap: 'clamp(14px,1.8vw,22px)', alignItems: 'stretch' }}>
        <TodayWindow words={words} sessions={sessions} typed={typed} phase={phase} elapsed={elapsed} accent={accent} />
        <PasteEditor typed={typed} phase={phase} accent={accent} />
      </div>

      {/* large recording pill */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 26, display: 'flex', justifyContent: 'center', zIndex: 3 }}>
        <span onMouseDown={(e) => { e.preventDefault(); press(); }} onMouseUp={release} onMouseLeave={release}
          style={{ cursor: 'pointer', WebkitUserSelect: 'none', userSelect: 'none' }} title="Hold to dictate">
          <FloatingPill phase={phase} elapsed={elapsed} accent={accent} size={48} />
        </span>
      </div>
    </div>
  );
}

// macOS window chrome shared by both panes
function WinChrome({ title, children }) {
  return (
    <div style={{
      background: FT.elevated, border: `1px solid ${FT.rule}`, borderRadius: 14,
      boxShadow: '0 22px 54px -26px rgba(20,12,4,0.35)', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', height: '100%',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 14px', height: 38, flexShrink: 0,
        borderBottom: `1px solid ${FT.ruleSoft}`, background: FT.paper, position: 'relative' }}>
        <span style={{ display: 'flex', gap: 7 }}>
          {['#E0A89B', '#E6D08A', '#A9C77E'].map((c, i) => (
            <span key={i} style={{ width: 11, height: 11, borderRadius: '50%', background: c, border: '0.5px solid rgba(0,0,0,0.08)' }} />
          ))}
        </span>
        <span className="mono" style={{ position: 'absolute', left: 0, right: 0, textAlign: 'center', fontSize: 11.5, color: FT.mute, letterSpacing: '0.04em' }}>{title}</span>
      </div>
      {children}
    </div>
  );
}

// LEFT — Freestyle "Today" screen, faithful to the App Redesign spec.
function TodayWindow({ words, sessions, typed, phase, elapsed, accent }) {
  return (
    <WinChrome title="Freestyle — Today">
      <div style={{ flex: 1, padding: 'clamp(22px,2.4vw,30px) clamp(22px,2.6vw,32px) 28px', overflow: 'hidden' }}>
        {/* masthead */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, marginBottom: 7 }}>
          <span className="mono" style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: FT.mute, whiteSpace: 'nowrap' }}>Thursday · May 28</span>
          <span style={{ flex: 1, height: 1, background: FT.ink, marginBottom: 4 }} />
          <span className="mono" style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: FT.mute, whiteSpace: 'nowrap' }}>Issue №1,247</span>
        </div>
        <div style={{ height: 3, background: FT.ink, marginBottom: 24 }} />

        {/* headline */}
        <h3 style={{ margin: '0 0 26px' }}>
          <span className="serif" style={{ fontSize: 'clamp(28px,3.2vw,38px)', color: FT.ink, lineHeight: 0.95, letterSpacing: '-0.025em', fontWeight: 400 }}>You said </span>
          <span className="serif-italic" style={{ fontSize: 'clamp(28px,3.2vw,38px)', color: accent.base, lineHeight: 0.95, transition: 'color .3s ease' }}>{words} words </span>
          <span className="serif" style={{ fontSize: 'clamp(28px,3.2vw,38px)', color: FT.ink, lineHeight: 0.95, letterSpacing: '-0.025em', fontWeight: 400 }}>today.</span>
        </h3>

        {/* metrics — 5 across, like the spec */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', paddingBottom: 22, borderBottom: `1px solid ${FT.rule}`, marginBottom: 24 }}>
          <MastheadMetric n={sessions} l="sessions" accent={accent} />
          <MastheadMetric n="10:12" l="min spoken" accent={accent} />
          <MastheadMetric n="148" l="avg wpm" accent={accent} hot />
          <MastheadMetric n="Slack" l="top app" accent={accent} />
          <MastheadMetric n="$0.12" l="cost" accent={accent} right />
        </div>

        {/* the script */}
        <div className="mono" style={{ fontSize: 10, color: FT.mute, letterSpacing: '0.18em', textTransform: 'uppercase', marginBottom: 14 }}>The script</div>
        <LiveEntry typed={typed} phase={phase} elapsed={elapsed} accent={accent} />
        {HOME_FEED.map((e, i) => <ScriptEntry key={i} {...e} accent={accent} />)}
      </div>
    </WinChrome>
  );
}

function MastheadMetric({ n, l, accent, hot, right }) {
  return (
    <div style={{ textAlign: right ? 'right' : 'left' }}>
      <div className="serif-italic" style={{ fontSize: 'clamp(22px,2.4vw,28px)', lineHeight: 1, color: hot ? accent.base : FT.ink, letterSpacing: '-0.01em', transition: 'color .3s ease' }}>{n}</div>
      <div className="mono" style={{ fontSize: 8.5, marginTop: 7, color: FT.mute, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{l}</div>
    </div>
  );
}

// One transcript row (spec ScriptEntry: time + app + hairline + stats | serif quote)
function ScriptEntry({ time, app, duration, words, wpm, text, accent }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '84px 1fr', gap: 20, padding: '16px 0', borderBottom: `1px solid ${FT.ruleSoft}` }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingTop: 3 }}>
        <div className="mono" style={{ fontSize: 11, color: FT.ink, fontWeight: 500, letterSpacing: '0.03em' }}>{time}</div>
        <div className="mono" style={{ fontSize: 9.5, color: accent.deep, fontWeight: 600, letterSpacing: '0.13em', textTransform: 'uppercase' }}>{app}</div>
        <div style={{ height: 1, background: FT.ruleSoft, margin: '3px 0' }} />
        <div className="mono" style={{ fontSize: 9, color: FT.mute, letterSpacing: '0.03em', lineHeight: 1.6 }}>{duration}s · {words} wds<br />{wpm} wpm</div>
      </div>
      <p className="serif" style={{ margin: 0, fontSize: 16.5, color: FT.ink, lineHeight: 1.5, fontWeight: 450, textWrap: 'pretty' }}>“{text}”</p>
    </div>
  );
}

// The live transcript — lands at the top of the feed as you dictate.
function LiveEntry({ typed, phase, elapsed, accent }) {
  const active = phase !== 'idle';
  const hasText = phase === 'typing' || phase === 'done';
  let cap;
  if (phase === 'idle') cap = <span className="serif-italic" style={{ fontSize: 15, color: FT.mute }}>ready when you are…</span>;
  else if (phase === 'recording') cap = <LiveCap accent={accent} label={`Listening · 0:0${Math.min(9, Math.floor(elapsed))}`} />;
  else if (phase === 'transcribing') cap = <LiveCap accent={accent} label="Transcribing…" />;

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '84px 1fr', gap: 20,
      padding: hasText ? '16px 0' : '14px 0', borderBottom: `1px solid ${FT.ruleSoft}`,
      background: active && !hasText ? `linear-gradient(90deg, ${accent.soft}66, transparent 64%)` : 'transparent',
      borderRadius: active && !hasText ? 8 : 0, transition: 'all .3s ease',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, paddingTop: 3 }}>
        <div className="mono" style={{ fontSize: 11, color: hasText ? FT.ink : FT.mute, fontWeight: 500, letterSpacing: '0.03em', transition: 'color .3s ease' }}>{hasText ? '11:42 pm' : 'now'}</div>
        <div className="mono" style={{ fontSize: 9.5, color: accent.deep, fontWeight: 600, letterSpacing: '0.13em', textTransform: 'uppercase', opacity: hasText ? 1 : 0, transition: 'opacity .3s ease' }}>Notes</div>
        <div style={{ height: 1, background: FT.ruleSoft, margin: '3px 0', opacity: hasText ? 1 : 0 }} />
        <div className="mono" style={{ fontSize: 9, color: FT.mute, letterSpacing: '0.03em', lineHeight: 1.6, opacity: phase === 'done' ? 1 : 0, transition: 'opacity .35s ease' }}>5s · 11 wds<br />132 wpm</div>
      </div>
      <div style={{ minHeight: 26, display: 'flex', alignItems: hasText ? 'flex-start' : 'center' }}>
        {hasText ? (
          <p className="serif" style={{ margin: 0, fontSize: 16.5, color: FT.ink, lineHeight: 1.5, fontWeight: 450, textWrap: 'pretty' }}>
            “{typed}”<Caret color={accent.base} blink={phase === 'done'} />
          </p>
        ) : cap}
      </div>
    </div>
  );
}

function LiveCap({ accent, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: accent.base, animation: 'fsDot 1.5s infinite ease-in-out' }} />
      <span className="mono" style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600, color: accent.ink }}>{label}</span>
    </span>
  );
}

// RIGHT — the editor your cursor is in. Text pastes here as you release.
function PasteEditor({ typed, phase, accent }) {
  const empty = typed.length === 0 && phase !== 'typing';
  const caretBlink = phase === 'idle' || phase === 'recording' || phase === 'done';
  return (
    <WinChrome title="Untitled — Notes">
      <div style={{ flex: 1, padding: 'clamp(24px,2.6vw,34px) clamp(24px,2.8vw,34px)', display: 'flex', flexDirection: 'column' }}>
        <div className="mono" style={{ fontSize: 10, color: FT.mute, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 18 }}>Note · 11:42 pm</div>
        <p style={{ margin: 0, fontFamily: "'DM Sans', sans-serif", fontSize: 'clamp(17px,1.7vw,20px)', lineHeight: 1.65, color: FT.ink, fontWeight: 400, textWrap: 'pretty', flex: 1 }}>
          {empty ? (
            <span style={{ color: FT.mute, opacity: 0.6 }}>
              <Caret color={accent.base} blink={caretBlink} />
              <span style={{ marginLeft: 4, fontStyle: 'italic' }}>Your dictated text lands here.</span>
            </span>
          ) : (
            <span>{typed}<Caret color={accent.base} blink={phase === 'done' || phase === 'idle'} /></span>
          )}
        </p>
        <div className="mono" style={{ fontSize: 9.5, color: FT.mute, letterSpacing: '0.04em', marginTop: 18, display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: phase === 'done' ? accent.base : FT.rule }} />
          {phase === 'done' ? 'pasted at cursor' : 'cursor here'}
        </div>
      </div>
    </WinChrome>
  );
}

Object.assign(window, { StageHome, TodayWindow, PasteEditor, WinChrome, MastheadMetric, ScriptEntry, LiveEntry });
