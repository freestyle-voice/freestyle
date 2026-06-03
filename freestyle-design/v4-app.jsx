// Freestyle — Studio app UI. Sidebar restored. Editorial main: masthead +
// hero stage + transcript feed + stats rail. Settings as bento grid.

// ============== WINDOW CHROME ==============
function V4MacWindow({ width=1100, height=720, title='Freestyle', children, bg=V4.CANVAS }) {
  return (
    <div style={{
      width, height, background: bg, borderRadius: 14, overflow: 'hidden',
      boxShadow: '0 24px 60px -20px rgba(20,12,4,0.18), 0 0 0 1px rgba(20,12,4,0.05)',
      display: 'flex', flexDirection: 'column',
      border: `1px solid ${V4.RULE}`,
    }}>
      <div style={{
        height: 36, background: V4.PAPER, display: 'flex', alignItems: 'center',
        padding: '0 14px', gap: 8, borderBottom: `1px solid ${V4.RULE}`,
      }}>
        <span style={{ width:12, height:12, borderRadius:'50%', background:'#FF5F57' }} />
        <span style={{ width:12, height:12, borderRadius:'50%', background:'#FEBC2E' }} />
        <span style={{ width:12, height:12, borderRadius:'50%', background:'#28C840' }} />
        <div style={{ flex: 1, textAlign:'center', fontSize: 11.5, color: V4.MUTE, letterSpacing: '0.04em' }}>{title}</div>
        <div style={{ width: 52 }} />
      </div>
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>{children}</div>
    </div>
  );
}

// ============== SIDEBAR ==============
function V4Sidebar({ active='today' }) {
  const items = [
    { id:'today',      label:'Today',      icon: <NavToday /> },
    { id:'history',    label:'History',    icon: <NavClock /> },
    { id:'dictionary', label:'Dictionary', icon: <NavBook /> },
    { id:'settings',   label:'Settings',   icon: <NavGear /> },
  ];
  return (
    <aside style={{
      width: 200, background: V4.PAPER, borderRight: `1px solid ${V4.RULE}`,
      padding: '20px 12px', display:'flex', flexDirection:'column', gap: 2, flexShrink: 0,
    }}>
      {/* Brand */}
      <div style={{ padding: '4px 8px 22px', display:'flex', alignItems:'center', gap: 10 }}>
        <MarkFlourish size={28} color={V4.OLIVE} />
        <V4Wordmark size={22} color={V4.INK} accent={V4.OLIVE} />
      </div>

      {/* Nav */}
      <div style={{ display:'flex', flexDirection:'column', gap: 2 }}>
        {items.map(it => {
          const on = it.id === active;
          return (
            <div key={it.id} style={{
              display:'flex', alignItems:'center', gap: 10, padding: '8px 10px',
              borderRadius: 8, fontSize: 13.5,
              color: on ? V4.INK : V4.INK_SOFT,
              background: on ? V4.ELEVATED : 'transparent',
              border: on ? `1px solid ${V4.RULE}` : '1px solid transparent',
              fontWeight: on ? 500 : 400,
              cursor: 'default',
            }}>
              <span style={{ color: on ? V4.OLIVE : V4.MUTE, display:'inline-flex' }}>{it.icon}</span>
              {it.label}
            </div>
          );
        })}
      </div>

      {/* Footer status */}
      <div style={{ marginTop: 'auto', padding: '12px 10px 0', borderTop: `1px solid ${V4.RULE}` }}>
        <div className="mono" style={{ fontSize: 10, color: V4.MUTE, letterSpacing: '0.12em', textTransform:'uppercase' }}>v0.1 · alpha</div>
        <div style={{ fontSize: 12, color: V4.INK_SOFT, marginTop: 4 }}>local · whisper.base.en</div>
        <div style={{ display:'flex', alignItems:'center', gap: 6, marginTop: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius:'50%', background: V4.OLIVE }} />
          <span className="mono" style={{ fontSize: 10, color: V4.OLIVE, letterSpacing:'0.12em' }}>READY</span>
        </div>
      </div>
    </aside>
  );
}

function NavToday() { return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="2.5" y="3.5" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.4" /><line x1="2.5" y1="6.5" x2="13.5" y2="6.5" stroke="currentColor" strokeWidth="1.4" /><line x1="5" y1="2" x2="5" y2="5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /><line x1="11" y1="2" x2="11" y2="5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" /></svg>; }
function NavClock() { return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4"/><path d="M8 5v3l2 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>; }
function NavBook() { return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M3 3.5h4.5a1.5 1.5 0 0 1 1.5 1.5V13a1 1 0 0 0-1-1H3v-8.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="M13 3.5H8.5A1.5 1.5 0 0 0 7 5V13a1 1 0 0 1 1-1h5v-8.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>; }
function NavGear() { return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.4"/><path d="M8 1.5v2M8 12.5v2M14.5 8h-2M3.5 8h-2M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4M12.6 12.6l-1.4-1.4M4.8 4.8L3.4 3.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>; }

// ============== HOME (editorial, with sidebar) ==============
function V4HomeArtboard() {
  return (
    <V4MacWindow title="Freestyle">
      <V4Sidebar active="today" />
      <div style={{ flex: 1, display:'flex', flexDirection:'column', minWidth: 0, background: V4.CANVAS }}>
        {/* Masthead row */}
        <div style={{
          padding: '20px 36px 0', display:'flex', alignItems:'flex-end',
          justifyContent:'space-between', gap: 24, flexShrink: 0,
        }}>
          <div className="mono" style={{ fontSize: 11, letterSpacing: '0.18em', textTransform:'uppercase', color: V4.MUTE }}>
            Thursday, May 28
          </div>
          <div style={{ flex: 1, height: 1, background: V4.RULE, marginBottom: 5 }} />
          <div className="mono" style={{ fontSize: 11, letterSpacing: '0.18em', textTransform:'uppercase', color: V4.MUTE }}>
            Issue №1,247
          </div>
        </div>

        <main style={{
          flex: 1, padding: '18px 36px 28px', display:'grid',
          gridTemplateColumns: '1fr 220px', gap: 28, minHeight: 0, overflow: 'hidden',
        }}>
          {/* ============== LEFT: hero + feed ============== */}
          <div style={{ display:'flex', flexDirection:'column', gap: 18, minWidth: 0 }}>
            {/* Hero stage card */}
            <div style={{
              background: V4.ELEVATED, border: `1px solid ${V4.RULE}`, borderRadius: 16,
              padding: '28px 32px 24px', position:'relative', overflow:'hidden',
            }}>
              <h1 style={{ margin: 0 }}>
                <span className="serif" style={{
                  fontSize: 62, fontWeight: 400, color: V4.INK, letterSpacing: '-0.025em', lineHeight: 0.95,
                }}>Hold </span>
                <span className="serif-italic" style={{ fontSize: 62, color: V4.OLIVE, lineHeight: 0.95 }}>fn</span>
                <span className="serif" style={{ fontSize: 62, color: V4.INK, lineHeight: 0.95, letterSpacing: '-0.025em' }}>, speak,</span>
                <br />
                <span className="serif-italic" style={{ fontSize: 62, color: V4.INK_SOFT, lineHeight: 0.95 }}>release.</span>
              </h1>
              <div style={{ marginTop: 18, opacity: 0.45 }}>
                <ScopeTrace4 width={500} height={42} cycles={4} weight={1.4} />
              </div>
              <div style={{ position:'absolute', top: 22, right: 26 }}>
                <MarkFlourish size={42} color={V4.OLIVE} weight={3.2} />
              </div>
            </div>

            {/* Feed header */}
            <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', marginTop: 4 }}>
              <h2 className="serif-italic" style={{ fontSize: 26, color: V4.INK, margin: 0, lineHeight: 1 }}>
                Today's voice
              </h2>
              <span className="mono" style={{ fontSize: 11, color: V4.MUTE, letterSpacing:'0.1em' }}>14 takes</span>
            </div>

            {/* Feed */}
            <div style={{ display:'flex', flexDirection:'column', gap: 12, overflow:'hidden', minHeight: 0 }}>
              <V4FeedItem
                time="11:42 pm" app="slack" duration="14s" words={38} featured
                quote="Could you push the meeting from two to three? Actually, let's make it tomorrow at ten — easier on everyone."
                tags={['casual tone', '1 backtrack fixed']}
              />
              <V4FeedItem
                time="10:14 pm" app="notes" duration="6s" words={11}
                quote="Reminder: grab the dry cleaning before seven — Tuesday night, not Wednesday."
              />
              <V4FeedItem
                time="8:22 pm" app="imessage" duration="4s" words={9}
                quote="Running ten minutes late, sorry — order me whatever."
              />
            </div>
          </div>

          {/* ============== RIGHT: stats rail ============== */}
          <aside style={{
            display:'flex', flexDirection:'column', gap: 0, minWidth: 0,
            borderLeft: `1px solid ${V4.RULE}`, paddingLeft: 22,
          }}>
            <div style={{ paddingBottom: 18, borderBottom: `1px solid ${V4.RULE}` }}>
              <div className="mono" style={{
                fontSize: 10, color: V4.MUTE, letterSpacing:'0.18em', textTransform:'uppercase', marginBottom: 12,
              }}>Live</div>
              <div style={{ display:'flex', alignItems:'center', gap: 10, marginBottom: 6 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: V4.OLIVE }} />
                <span style={{ fontSize: 13, color: V4.INK, fontWeight: 500 }}>Mic ready</span>
              </div>
              <div style={{ fontSize: 12, color: V4.MUTE, lineHeight: 1.5 }}>
                MacBook Pro Microphone
              </div>
            </div>

            <div style={{ padding: '18px 0', borderBottom: `1px solid ${V4.RULE}` }}>
              <div className="mono" style={{
                fontSize: 10, color: V4.MUTE, letterSpacing:'0.18em', textTransform:'uppercase', marginBottom: 14,
              }}>Today</div>
              <V4MetricRow n="1,284" l="words" />
              <V4MetricRow n="4.2×" l="faster than typing" accent />
              <V4MetricRow n="98%" l="local — no cloud" />
            </div>

            <div style={{ padding: '18px 0 0' }}>
              <div className="mono" style={{
                fontSize: 10, color: V4.MUTE, letterSpacing:'0.18em', textTransform:'uppercase', marginBottom: 10,
              }}>Active</div>
              <V4InlineSwitch label="Polish layer" on={true} />
              <V4InlineSwitch label="Cloud fallback" on={false} />
            </div>
          </aside>
        </main>
      </div>
    </V4MacWindow>
  );
}

function V4FeedItem({ time, app, duration, words, quote, tags, featured }) {
  return (
    <div style={{
      background: featured ? V4.ELEVATED : 'transparent',
      border: featured ? `1px solid ${V4.RULE}` : '1px solid transparent',
      borderRadius: featured ? 12 : 0,
      padding: featured ? '16px 20px' : '4px 0 12px',
      borderBottom: !featured ? `1px solid ${V4.RULE_SOFT}` : undefined,
      display:'flex', flexDirection:'column', gap: 8,
    }}>
      <div style={{ display:'flex', alignItems:'center', gap: 10 }}>
        <span className="mono" style={{ fontSize: 11, color: V4.INK, letterSpacing: '0.06em', fontWeight: 500 }}>
          {time}
        </span>
        <span style={{ width: 3, height: 3, borderRadius: '50%', background: V4.MUTE }} />
        <span className="mono" style={{ fontSize: 11, color: V4.OLIVE, letterSpacing:'0.1em', textTransform:'uppercase', fontWeight: 600 }}>
          {app}
        </span>
        <div style={{ flex: 1 }} />
        <span className="mono" style={{ fontSize: 10.5, color: V4.MUTE, letterSpacing:'0.06em' }}>
          {duration} · {words} wds
        </span>
      </div>
      <p className="serif-italic" style={{
        margin: 0, fontSize: featured ? 22 : 18, color: V4.INK_SOFT, lineHeight: 1.35,
        textWrap: 'pretty',
      }}>
        “{quote}”
      </p>
      {tags && (
        <div style={{ display:'flex', gap: 6, marginTop: 2 }}>
          {tags.map(t => (
            <span key={t} className="mono" style={{
              fontSize: 9.5, padding: '3px 8px', background: 'transparent',
              border: `1px solid ${V4.RULE}`, color: V4.MUTE, borderRadius: 999,
              letterSpacing: '0.1em', textTransform: 'uppercase',
            }}>{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function V4MetricRow({ n, l, accent }) {
  return (
    <div style={{ marginBottom: 12, display:'flex', alignItems:'baseline', gap: 12 }}>
      <div className="serif-italic" style={{
        fontSize: 32, color: accent ? V4.OLIVE : V4.INK, lineHeight: 1, minWidth: 70,
      }}>{n}</div>
      <div className="mono" style={{
        fontSize: 10, color: V4.MUTE, letterSpacing: '0.08em', textTransform:'uppercase', lineHeight: 1.3,
      }}>{l}</div>
    </div>
  );
}

function V4InlineSwitch({ label, on }) {
  return (
    <div style={{
      display:'flex', alignItems:'center', justifyContent:'space-between',
      padding: '8px 0', borderBottom: `1px solid ${V4.RULE_SOFT}`,
    }}>
      <span style={{ fontSize: 12.5, color: V4.INK }}>{label}</span>
      <div style={{ display:'flex', alignItems:'center', gap: 8 }}>
        <span className="mono" style={{
          fontSize: 10, letterSpacing:'0.12em',
          color: on ? V4.OLIVE : V4.MUTE,
        }}>{on ? 'ON' : 'OFF'}</span>
        <V4Toggle on={on} compact />
      </div>
    </div>
  );
}

function V4Toggle({ on, compact }) {
  const w = compact ? 32 : 44;
  const h = compact ? 18 : 26;
  const knob = compact ? 14 : 20;
  return (
    <div style={{
      width: w, height: h, borderRadius: 999,
      background: on ? V4.OLIVE : V4.PAPER,
      border: `1px solid ${on ? V4.OLIVE_DEEP : V4.RULE}`,
      position: 'relative',
    }}>
      <div style={{
        width: knob, height: knob, borderRadius: '50%',
        background: on ? V4.CANVAS : V4.MUTE,
        position: 'absolute', top: 1, left: on ? w - knob - 3 : 2,
        transition: 'left 0.18s',
      }} />
    </div>
  );
}

// ============== SETTINGS (bento, with sidebar) ==============
function V4SettingsArtboard() {
  return (
    <V4MacWindow title="Freestyle — Settings">
      <V4Sidebar active="settings" />
      <div style={{ flex: 1, display:'flex', flexDirection:'column', minWidth: 0, background: V4.CANVAS }}>
        <div style={{
          padding: '20px 36px 0', display:'flex', alignItems:'flex-end',
          justifyContent:'space-between', gap: 24, flexShrink: 0,
        }}>
          <div className="mono" style={{ fontSize: 11, letterSpacing: '0.18em', textTransform:'uppercase', color: V4.MUTE }}>
            Preferences
          </div>
          <div style={{ flex: 1, height: 1, background: V4.RULE, marginBottom: 5 }} />
          <div className="mono" style={{ fontSize: 11, letterSpacing: '0.18em', textTransform:'uppercase', color: V4.MUTE }}>
            §03
          </div>
        </div>

        <main style={{
          flex: 1, padding: '20px 36px 28px', display:'flex', flexDirection:'column', gap: 20,
          minHeight: 0, overflow:'auto',
        }}>
          {/* Masthead */}
          <h1 style={{ margin: 0 }}>
            <span className="serif" style={{ fontSize: 56, color: V4.INK, lineHeight: 0.95, letterSpacing: '-0.025em' }}>Make it </span>
            <span className="serif-italic" style={{ fontSize: 56, color: V4.OLIVE, lineHeight: 0.95 }}>yours.</span>
          </h1>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(6, 1fr)', gap: 12 }}>
            <V4BentoCard span={4} label="Hotkey" desc="Hold to record. Release to transcribe.">
              <div style={{ display:'flex', gap: 10, alignItems:'center' }}>
                <V4KbdBig>fn</V4KbdBig>
                <span style={{ fontSize: 12, color: V4.MUTE }}>or</span>
                <V4KbdBig>⌃</V4KbdBig><V4KbdBig>space</V4KbdBig>
                <div style={{ flex: 1 }} />
                <button style={V4ChipBtn}>Change</button>
              </div>
            </V4BentoCard>

            <V4BentoCard span={2} label="Polish" desc="Remove um, fix backtracks." beta>
              <div style={{ display:'flex', alignItems:'center', gap: 12 }}>
                <V4Toggle on={true} />
                <span className="mono" style={{ fontSize: 11, color: V4.OLIVE, letterSpacing: '0.12em' }}>ENABLED</span>
              </div>
            </V4BentoCard>

            <V4BentoCard span={3} label="Transcription" desc="Where audio becomes text.">
              <V4Segment options={[
                { id: 'local', label: 'On-device', sub: 'whisper.cpp · base.en' },
                { id: 'cloud', label: 'Cloud',     sub: 'OpenAI · BYOK' },
              ]} active="local" />
            </V4BentoCard>

            <V4BentoCard span={3} label="Local model" desc="60 MB · Application Support.">
              <div style={{ display:'flex', alignItems:'center', gap: 12 }}>
                <V4ProgressBar percent={100} />
                <span className="mono" style={{ fontSize: 11, color: V4.OLIVE, fontWeight: 500, letterSpacing:'0.06em' }}>DOWNLOADED</span>
                <div style={{ flex: 1 }} />
                <button style={V4GhostBtn}>Re-download</button>
              </div>
            </V4BentoCard>

            <V4BentoCard span={4} label="OpenAI API key" desc="Stored encrypted in macOS Keychain. Never logged.">
              <div style={{ display:'flex', alignItems:'center', gap: 10 }}>
                <div className="mono" style={{
                  fontSize: 13, padding: '8px 12px', background: V4.PAPER, border: `1px solid ${V4.RULE}`,
                  borderRadius: 8, color: V4.INK_SOFT, letterSpacing: '0.04em', flex: 1,
                }}>sk-…·M3vQ</div>
                <button style={V4ChipBtn}>Replace</button>
                <button style={{ ...V4GhostBtn, color: V4.BLUSH, borderColor: '#DD6E4E55' }}>Clear</button>
              </div>
            </V4BentoCard>

            <V4BentoCard span={2} label="Microphone" desc="Stays on internal mic.">
              <V4Dropdown value="Built-in" />
            </V4BentoCard>

            <V4BentoCard span={2} label="Paste" desc="How text reaches the cursor.">
              <V4Segment compact options={[
                { id: 'cmdv', label: '⌘V' },
                { id: 'type', label: 'Type' },
              ]} active="cmdv" />
            </V4BentoCard>

            <V4BentoCard span={2} label="Launch on login" desc="Start with macOS.">
              <V4Toggle on={true} />
            </V4BentoCard>

            <V4BentoCard span={2} label="Sounds" desc="Soft chimes on start / end.">
              <V4Toggle on={false} />
            </V4BentoCard>
          </div>
        </main>
      </div>
    </V4MacWindow>
  );
}

function V4BentoCard({ children, label, desc, span = 2, beta }) {
  return (
    <div style={{
      gridColumn: `span ${span}`, background: V4.ELEVATED,
      border: `1px solid ${V4.RULE}`, borderRadius: 14, padding: '16px 18px',
      display:'flex', flexDirection:'column', gap: 12, minHeight: 124,
    }}>
      <div>
        <div style={{ display:'flex', alignItems:'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 13.5, color: V4.INK, fontWeight: 500 }}>{label}</span>
          {beta && <span className="mono" style={{
            fontSize: 9, padding: '2px 6px', background: V4.OLIVE_SOFT, color: V4.OLIVE_INK,
            border: `1px solid ${V4.OLIVE}33`, borderRadius: 999, letterSpacing: '0.12em',
          }}>BETA</span>}
        </div>
        <div style={{ fontSize: 11.5, color: V4.MUTE, lineHeight: 1.45 }}>{desc}</div>
      </div>
      <div style={{ marginTop: 'auto' }}>{children}</div>
    </div>
  );
}

function V4KbdBig({ children }) {
  return (
    <span className="mono" style={{
      display:'inline-flex', alignItems:'center', justifyContent:'center',
      minWidth: 36, height: 32, padding: '0 9px',
      background: V4.CANVAS, border: `1px solid ${V4.RULE}`,
      borderBottom: `2px solid ${V4.RULE}`, borderRadius: 7,
      fontSize: 13, color: V4.INK, fontWeight: 500,
    }}>{children}</span>
  );
}

const V4ChipBtn = {
  background: V4.INK, color: V4.CANVAS, border: 'none', padding: '7px 14px',
  borderRadius: 7, fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer', fontWeight: 500,
};

const V4GhostBtn = {
  background: 'transparent', color: V4.INK_SOFT, border: `1px solid ${V4.RULE}`,
  padding: '6px 12px', borderRadius: 7, fontSize: 12,
  fontFamily: 'inherit', cursor: 'pointer',
};

function V4Segment({ options, active, compact }) {
  return (
    <div style={{
      display:'inline-flex', background: V4.PAPER, padding: 4, borderRadius: 10,
      border: `1px solid ${V4.RULE}`, gap: 4,
    }}>
      {options.map(o => {
        const isOn = o.id === active;
        return (
          <div key={o.id} style={{
            background: isOn ? V4.ELEVATED : 'transparent',
            border: isOn ? `1px solid ${V4.RULE}` : '1px solid transparent',
            padding: compact ? '5px 12px' : '7px 12px', borderRadius: 7,
            display:'flex', flexDirection:'column',
            boxShadow: isOn ? '0 1px 2px rgba(20,12,4,0.05)' : 'none',
          }}>
            <div style={{ fontSize: 12.5, fontWeight: 500, color: isOn ? V4.INK : V4.INK_SOFT }}>{o.label}</div>
            {o.sub && <div className="mono" style={{ fontSize: 10, color: V4.MUTE, letterSpacing:'0.04em' }}>{o.sub}</div>}
          </div>
        );
      })}
    </div>
  );
}

function V4ProgressBar({ percent }) {
  return (
    <div style={{ width: 110, height: 4, borderRadius: 999, background: V4.PAPER, overflow:'hidden', border:`1px solid ${V4.RULE_SOFT}` }}>
      <div style={{ width: `${percent}%`, height: '100%', background: V4.OLIVE, borderRadius: 999 }} />
    </div>
  );
}

function V4Dropdown({ value }) {
  return (
    <div style={{
      display:'inline-flex', alignItems:'center', gap: 12,
      padding: '7px 11px', background: V4.CANVAS, border: `1px solid ${V4.RULE}`,
      borderRadius: 7, fontSize: 12.5, color: V4.INK, width: '100%', justifyContent:'space-between',
    }}>
      <span>{value}</span>
      <svg width="10" height="6" viewBox="0 0 10 6"><path d="M1 1l4 4 4-4" stroke={V4.MUTE} strokeWidth="1.4" fill="none" strokeLinecap="round" /></svg>
    </div>
  );
}

// ============== FLOATING PILL ==============
function V4PillArtboard() {
  return (
    <div style={{
      width: 1100, height: 700,
      background: `radial-gradient(120% 80% at 50% 100%, ${V4.PAPER} 0%, ${V4.CANVAS} 80%)`,
      padding: 40, boxSizing:'border-box',
      display:'flex', flexDirection:'column', gap: 24, position:'relative', overflow:'hidden',
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <V4Eyebrow text="05 — Floating pill" />
        <div className="mono" style={{ fontSize: 11, color: V4.MUTE, letterSpacing: '0.12em' }}>
          height 48 · radius 28 · always on top
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns: '1fr 1fr', gap: 18, flex: 1 }}>
        <V4PillSlot caption="Idle · hint only"><V4PillIdle /></V4PillSlot>
        <V4PillSlot caption="Listening · live levels" accent><V4PillRecording /></V4PillSlot>
        <V4PillSlot caption="Transcribing · whisper running"><V4PillTranscribing /></V4PillSlot>
        <V4PillSlot caption="Pasted · brief confirm, then fades"><V4PillPasted /></V4PillSlot>
      </div>

      <div style={{ fontSize: 13.5, color: V4.INK_SOFT, maxWidth: 720, lineHeight: 1.5 }}>
        The olive fill is the only state-color in the system — <span style={{ color: V4.OLIVE, fontWeight: 500 }}>when you see it, the mic is open.</span>
      </div>
    </div>
  );
}

function V4PillSlot({ caption, children, accent }) {
  return (
    <div style={{
      background: V4.ELEVATED, borderRadius: 14, border: `1px solid ${V4.RULE}`,
      padding: 22, display:'flex', flexDirection:'column', gap: 16,
      alignItems:'center', justifyContent:'center', minHeight: 0,
    }}>
      <div style={{ flex: 1, display:'flex', alignItems:'center', justifyContent:'center' }}>
        {children}
      </div>
      <div style={{ display:'flex', alignItems:'center', gap: 8 }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: accent ? V4.OLIVE : V4.MUTE,
        }} />
        <div className="mono" style={{ fontSize: 11, color: V4.MUTE, letterSpacing: '0.08em' }}>{caption}</div>
      </div>
    </div>
  );
}

function V4PillBase({ children, bg = V4.INK, color = V4.CANVAS, border }) {
  return (
    <div style={{
      height: 48, padding: '0 18px', borderRadius: 28,
      background: bg, color, display:'inline-flex', alignItems:'center', gap: 12,
      border: border ? `1px solid ${border}` : 'none',
      boxShadow: '0 12px 28px -8px rgba(20,12,4,0.35), 0 0 0 1px rgba(20,12,4,0.08)',
      fontFamily: 'DM Sans', fontSize: 14, fontWeight: 500,
    }}>{children}</div>
  );
}

function V4PillIdle() {
  return (
    <V4PillBase>
      <V4MicGlyph size={17} color={V4.CANVAS} />
      <span style={{ opacity: 0.85 }}>Hold</span>
      <span className="mono" style={{
        padding: '2px 7px', background: 'rgba(255,255,255,0.12)', borderRadius: 5,
        fontSize: 11, letterSpacing: '0.06em',
      }}>fn</span>
      <span style={{ opacity: 0.6, marginLeft: 2 }}>to talk</span>
    </V4PillBase>
  );
}

function V4PillRecording() {
  return (
    <V4PillBase bg={V4.OLIVE} color={V4.CANVAS} border={V4.OLIVE_DEEP}>
      <span style={{ position:'relative', display:'inline-flex', alignItems:'center', justifyContent:'center', width: 16, height: 16 }}>
        <span style={{ width: 10, height: 10, borderRadius:'50%', background: V4.CANVAS }} />
      </span>
      <VoiceBars4 count={14} width={130} height={26} color={V4.CANVAS} animated />
      <span className="mono" style={{ fontSize: 11, letterSpacing:'0.06em', color: V4.CANVAS, opacity: 0.85 }}>0:04</span>
    </V4PillBase>
  );
}

function V4PillTranscribing() {
  return (
    <V4PillBase bg={V4.ELEVATED} color={V4.INK} border={V4.RULE}>
      <V4SpinnerDots />
      <span>Transcribing</span>
      <span className="mono" style={{
        padding: '2px 7px', background: V4.PAPER, borderRadius: 5,
        fontSize: 10, letterSpacing: '0.08em', color: V4.MUTE, marginLeft: 4,
        border: `1px solid ${V4.RULE}`,
      }}>WHISPER.BASE</span>
    </V4PillBase>
  );
}

function V4SpinnerDots() {
  return (
    <span style={{ display:'inline-flex', gap: 5, alignItems:'center' }}>
      {[0,1,2].map(i => (
        <span key={i} style={{
          width: 6, height: 6, borderRadius:'50%', background: V4.OLIVE,
          animation: `v4dot 1.1s ${i*0.15}s infinite ease-in-out`,
        }} />
      ))}
      <style>{`@keyframes v4dot{0%,100%{opacity:0.3;transform:translateY(0)}50%{opacity:1;transform:translateY(-3px)}}`}</style>
    </span>
  );
}

function V4PillPasted() {
  return (
    <V4PillBase bg={V4.ELEVATED} color={V4.INK} border={V4.RULE}>
      <V4CheckIcon />
      <span>Pasted</span>
      <span style={{ color: V4.MUTE, fontSize: 12 }}>· 38 words to Slack</span>
    </V4PillBase>
  );
}

function V4CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" stroke={V4.OLIVE} strokeWidth="1.4" opacity="0.5" />
      <path d="M5 8l2 2 4-4" stroke={V4.OLIVE} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function V4MicGlyph({ size=22, color=V4.INK }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="9" y="3" width="6" height="11" rx="3" stroke={color} strokeWidth="1.5" />
      <path d="M5 11a7 7 0 0 0 14 0" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 18v3" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

Object.assign(window, {
  V4MacWindow, V4Sidebar,
  V4HomeArtboard, V4SettingsArtboard, V4PillArtboard,
});
