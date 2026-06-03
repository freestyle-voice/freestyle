// Freestyle — Daily app UI. Editorial / masthead layout. No sidebar.
// Home = a personal voice periodical: masthead, hero stage, two-column
// transcript feed + stats rail. Settings = bento grid of setting cards.

// ============== WINDOW CHROME ==============
function V3MacWindow({ width=1100, height=720, title='Freestyle', children, bg=V3.CANVAS }) {
  return (
    <div style={{
      width, height, background: bg, borderRadius: 14, overflow: 'hidden',
      boxShadow: '0 24px 60px -20px rgba(20,12,4,0.18), 0 0 0 1px rgba(20,12,4,0.05)',
      display: 'flex', flexDirection: 'column',
      border: `1px solid ${V3.RULE}`,
    }}>
      <div style={{
        height: 36, background: V3.PAPER, display: 'flex', alignItems: 'center',
        padding: '0 14px', gap: 8, borderBottom: `1px solid ${V3.RULE}`,
      }}>
        <span style={{ width:12, height:12, borderRadius:'50%', background:'#FF5F57' }} />
        <span style={{ width:12, height:12, borderRadius:'50%', background:'#FEBC2E' }} />
        <span style={{ width:12, height:12, borderRadius:'50%', background:'#28C840' }} />
        <div style={{ flex: 1, textAlign:'center', fontSize: 11.5, color: V3.MUTE, letterSpacing: '0.04em' }}>{title}</div>
        <div style={{ width: 52 }} />
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection:'column', minHeight: 0 }}>{children}</div>
    </div>
  );
}

// ============== TOP NAV (replaces sidebar) ==============
function V3TopNav({ active = 'today', live = false }) {
  const items = [
    { id: 'today',      label: 'Today' },
    { id: 'history',    label: 'History' },
    { id: 'dictionary', label: 'Dictionary' },
    { id: 'settings',   label: 'Settings' },
  ];
  return (
    <div style={{
      padding: '20px 48px 0', display:'flex', alignItems:'center',
      justifyContent:'space-between', flexShrink: 0,
    }}>
      <div style={{ display:'flex', alignItems:'center', gap: 14 }}>
        <MarkSlash3 size={26} fill={V3.LIME} color={V3.LIME_INK} />
        <V3Wordmark size={22} color={V3.INK} accent={V3.LIME_DEEP} />
      </div>
      <nav style={{ display:'flex', alignItems:'center', gap: 0 }}>
        {items.map((it, i) => (
          <React.Fragment key={it.id}>
            {i > 0 && <span style={{ width: 1, height: 14, background: V3.RULE, margin: '0 16px' }} />}
            <span style={{
              fontSize: 13, fontWeight: it.id === active ? 600 : 400,
              color: it.id === active ? V3.INK : V3.MUTE,
              letterSpacing: '0.02em', cursor: 'default',
              borderBottom: it.id === active ? `1.5px solid ${V3.LIME_DEEP}` : '1.5px solid transparent',
              paddingBottom: 4,
            }}>{it.label}</span>
          </React.Fragment>
        ))}
      </nav>
      <div style={{ display:'flex', alignItems:'center', gap: 12, minWidth: 160, justifyContent:'flex-end' }}>
        {live
          ? <RecBadge text="LIVE" />
          : <>
              <span className="mono" style={{ fontSize: 10.5, color: V3.MUTE, letterSpacing:'0.14em' }}>READY</span>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: V3.LIME_DEEP }} />
            </>
        }
      </div>
    </div>
  );
}

// ============== HOME (editorial) ==============
function V3HomeArtboard() {
  return (
    <V3MacWindow title="Freestyle">
      <V3TopNav active="today" />
      <div style={{
        padding: '12px 48px 0', display:'flex', alignItems:'flex-end',
        justifyContent:'space-between', gap: 32, flexShrink: 0,
      }}>
        <div className="mono" style={{ fontSize: 11, letterSpacing: '0.18em', textTransform:'uppercase', color: V3.MUTE }}>
          Thursday, May 28
        </div>
        <div style={{ flex: 1, height: 1, background: V3.RULE, marginBottom: 5 }} />
        <div className="mono" style={{ fontSize: 11, letterSpacing: '0.18em', textTransform:'uppercase', color: V3.MUTE }}>
          Issue №1,247
        </div>
      </div>

      <main style={{
        flex: 1, padding: '20px 48px 36px', display:'grid',
        gridTemplateColumns: '1fr 280px', gap: 32, minHeight: 0, overflow: 'hidden',
      }}>
        {/* ============== LEFT: hero + feed ============== */}
        <div style={{ display:'flex', flexDirection:'column', gap: 22, minWidth: 0 }}>
          {/* Hero stage card */}
          <div style={{
            background: V3.ELEVATED, border: `1px solid ${V3.RULE}`, borderRadius: 16,
            padding: '32px 36px 28px', position:'relative', overflow:'hidden',
          }}>
            <h1 style={{ margin: 0 }}>
              <span className="serif" style={{
                fontSize: 76, fontWeight: 400, color: V3.INK, letterSpacing: '-0.025em', lineHeight: 0.95,
              }}>Hold </span>
              <span className="serif-italic" style={{ fontSize: 76, color: V3.LIME_DEEP, lineHeight: 0.95 }}>fn</span>
              <span className="serif" style={{ fontSize: 76, color: V3.INK, lineHeight: 0.95, letterSpacing: '-0.025em' }}>, speak,</span>
              <br />
              <span className="serif-italic" style={{ fontSize: 76, color: V3.INK_SOFT, lineHeight: 0.95 }}>release.</span>
            </h1>
            <div style={{ marginTop: 18, opacity: 0.45 }}>
              <ScopeTrace3 width={560} height={48} cycles={4} weight={1.4} />
            </div>
            <div style={{
              position:'absolute', top: 24, right: 28, display:'flex', alignItems:'center', gap: 10,
            }}>
              <span className="mono" style={{
                fontSize: 10, padding: '3px 8px', borderRadius: 4, background: V3.PAPER,
                color: V3.INK_SOFT, letterSpacing: '0.12em', border: `1px solid ${V3.RULE}`,
              }}>EDITORIAL</span>
            </div>
          </div>

          {/* Feed header */}
          <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', marginTop: 4 }}>
            <h2 className="serif-italic" style={{ fontSize: 30, color: V3.INK, margin: 0, lineHeight: 1 }}>
              Today's voice
            </h2>
            <span className="mono" style={{ fontSize: 11, color: V3.MUTE, letterSpacing:'0.1em' }}>14 takes</span>
          </div>

          {/* Transcript feed */}
          <div style={{ display:'flex', flexDirection:'column', gap: 14, overflow:'hidden', minHeight: 0 }}>
            <V3FeedItem
              time="11:42 pm" app="slack" duration="14s" words={38} featured
              quote="Could you push the meeting from two to three? Actually, let's make it tomorrow at ten — easier on everyone."
              tags={['casual tone', '1 backtrack fixed']}
            />
            <V3FeedItem
              time="10:14 pm" app="notes" duration="6s" words={11}
              quote="Reminder: grab the dry cleaning before seven — Tuesday night, not Wednesday."
            />
            <V3FeedItem
              time="8:22 pm" app="imessage" duration="4s" words={9}
              quote="Running ten minutes late, sorry — order me whatever."
            />
          </div>
        </div>

        {/* ============== RIGHT: stats rail ============== */}
        <aside style={{
          display:'flex', flexDirection:'column', gap: 0, minWidth: 0,
          borderLeft: `1px solid ${V3.RULE}`, paddingLeft: 28,
        }}>
          {/* Live block */}
          <div style={{ paddingBottom: 22, borderBottom: `1px solid ${V3.RULE}` }}>
            <div className="mono" style={{
              fontSize: 10, color: V3.MUTE, letterSpacing:'0.18em', textTransform:'uppercase', marginBottom: 12,
            }}>Live</div>
            <div style={{ display:'flex', alignItems:'center', gap: 10, marginBottom: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: V3.LIME_DEEP }} />
              <span style={{ fontSize: 13.5, color: V3.INK, fontWeight: 500 }}>Mic ready</span>
            </div>
            <div style={{ fontSize: 12.5, color: V3.MUTE, lineHeight: 1.5 }}>
              MacBook Pro Microphone
            </div>
            <div style={{ marginTop: 14, padding: '10px 12px', background: V3.PAPER, borderRadius: 8, border: `1px solid ${V3.RULE_SOFT}` }}>
              <div className="mono" style={{ fontSize: 10, color: V3.MUTE, letterSpacing: '0.1em' }}>MODEL</div>
              <div style={{ fontSize: 12.5, color: V3.INK, marginTop: 2 }}>whisper.cpp · base.en</div>
            </div>
          </div>

          {/* Today block */}
          <div style={{ padding: '22px 0', borderBottom: `1px solid ${V3.RULE}` }}>
            <div className="mono" style={{
              fontSize: 10, color: V3.MUTE, letterSpacing:'0.18em', textTransform:'uppercase', marginBottom: 16,
            }}>Today</div>
            <V3MetricRow n="1,284" l="words" />
            <V3MetricRow n="4.2×" l="faster than typing" accent />
            <V3MetricRow n="98%" l="local — no cloud" />
          </div>

          {/* Switches */}
          <div style={{ padding: '22px 0 0' }}>
            <div className="mono" style={{
              fontSize: 10, color: V3.MUTE, letterSpacing:'0.18em', textTransform:'uppercase', marginBottom: 12,
            }}>Active</div>
            <V3InlineSwitch label="Polish layer" on={true} />
            <V3InlineSwitch label="Cloud fallback" on={false} />
          </div>
        </aside>
      </main>
    </V3MacWindow>
  );
}

function V3FeedItem({ time, app, duration, words, quote, tags, featured }) {
  return (
    <div style={{
      background: featured ? V3.ELEVATED : 'transparent',
      border: featured ? `1px solid ${V3.RULE}` : '1px solid transparent',
      borderRadius: featured ? 12 : 0,
      padding: featured ? '18px 22px' : '4px 0 14px',
      borderBottom: !featured ? `1px solid ${V3.RULE_SOFT}` : undefined,
      display:'flex', flexDirection:'column', gap: 10,
    }}>
      <div style={{ display:'flex', alignItems:'center', gap: 10 }}>
        <span className="mono" style={{ fontSize: 11, color: V3.INK, letterSpacing: '0.06em', fontWeight: 500 }}>
          {time}
        </span>
        <span style={{ width: 3, height: 3, borderRadius: '50%', background: V3.MUTE }} />
        <span className="mono" style={{ fontSize: 11, color: V3.LIME_DEEP, letterSpacing:'0.1em', textTransform:'uppercase', fontWeight: 600 }}>
          {app}
        </span>
        <div style={{ flex: 1 }} />
        <span className="mono" style={{ fontSize: 10.5, color: V3.MUTE, letterSpacing:'0.06em' }}>
          {duration} · {words} wds
        </span>
      </div>
      <p className="serif-italic" style={{
        margin: 0, fontSize: featured ? 24 : 19, color: V3.INK_SOFT, lineHeight: 1.35,
        textWrap: 'pretty',
      }}>
        “{quote}”
      </p>
      {tags && (
        <div style={{ display:'flex', gap: 6, marginTop: 2 }}>
          {tags.map(t => (
            <span key={t} className="mono" style={{
              fontSize: 9.5, padding: '3px 8px', background: 'transparent',
              border: `1px solid ${V3.RULE}`, color: V3.MUTE, borderRadius: 999,
              letterSpacing: '0.1em', textTransform: 'uppercase',
            }}>{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function V3MetricRow({ n, l, accent }) {
  return (
    <div style={{ marginBottom: 14, display:'flex', alignItems:'baseline', gap: 12 }}>
      <div className="serif-italic" style={{
        fontSize: 36, color: accent ? V3.LIME_DEEP : V3.INK, lineHeight: 1, minWidth: 78,
      }}>{n}</div>
      <div className="mono" style={{
        fontSize: 10.5, color: V3.MUTE, letterSpacing: '0.08em', textTransform:'uppercase', lineHeight: 1.3,
      }}>{l}</div>
    </div>
  );
}

function V3InlineSwitch({ label, on }) {
  return (
    <div style={{
      display:'flex', alignItems:'center', justifyContent:'space-between',
      padding: '8px 0', borderBottom: `1px solid ${V3.RULE_SOFT}`,
    }}>
      <span style={{ fontSize: 13, color: V3.INK }}>{label}</span>
      <div style={{ display:'flex', alignItems:'center', gap: 8 }}>
        <span className="mono" style={{
          fontSize: 10, letterSpacing:'0.12em',
          color: on ? V3.LIME_DEEP : V3.MUTE,
        }}>{on ? 'ON' : 'OFF'}</span>
        <V3Toggle on={on} compact />
      </div>
    </div>
  );
}

function V3Toggle({ on, compact }) {
  const w = compact ? 32 : 44;
  const h = compact ? 18 : 26;
  const knob = compact ? 14 : 20;
  return (
    <div style={{
      width: w, height: h, borderRadius: 999,
      background: on ? V3.LIME : V3.PAPER,
      border: `1px solid ${on ? V3.LIME_DEEP : V3.RULE}`,
      position: 'relative',
    }}>
      <div style={{
        width: knob, height: knob, borderRadius: '50%',
        background: on ? V3.LIME_INK : V3.MUTE,
        position: 'absolute', top: 1, left: on ? w - knob - 3 : 2,
        transition: 'left 0.18s',
      }} />
    </div>
  );
}

// ============== SETTINGS (bento grid) ==============
function V3SettingsArtboard() {
  return (
    <V3MacWindow title="Freestyle — Settings">
      <V3TopNav active="settings" />
      <div style={{
        padding: '12px 48px 0', display:'flex', alignItems:'flex-end',
        justifyContent:'space-between', gap: 32, flexShrink: 0,
      }}>
        <div className="mono" style={{ fontSize: 11, letterSpacing: '0.18em', textTransform:'uppercase', color: V3.MUTE }}>
          Preferences
        </div>
        <div style={{ flex: 1, height: 1, background: V3.RULE, marginBottom: 5 }} />
        <div className="mono" style={{ fontSize: 11, letterSpacing: '0.18em', textTransform:'uppercase', color: V3.MUTE }}>
          §03
        </div>
      </div>

      <main style={{
        flex: 1, padding: '22px 48px 36px', display:'flex', flexDirection:'column', gap: 22,
        minHeight: 0, overflow:'auto',
      }}>
        {/* Masthead */}
        <h1 style={{ margin: 0 }}>
          <span className="serif" style={{ fontSize: 64, color: V3.INK, lineHeight: 0.95, letterSpacing: '-0.025em' }}>Make it </span>
          <span className="serif-italic" style={{ fontSize: 64, color: V3.LIME_DEEP, lineHeight: 0.95 }}>yours.</span>
        </h1>

        {/* Bento grid */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(6, 1fr)', gap: 14 }}>
          {/* Hotkey — wide */}
          <V3BentoCard span={4} label="Hotkey" desc="Hold to record. Release to transcribe.">
            <div style={{ display:'flex', gap: 10, alignItems:'center' }}>
              <V3KbdBig>fn</V3KbdBig>
              <span style={{ fontSize: 12, color: V3.MUTE }}>or</span>
              <V3KbdBig>⌃</V3KbdBig><V3KbdBig>space</V3KbdBig>
              <div style={{ flex: 1 }} />
              <button style={V3ChipBtn}>Change</button>
            </div>
          </V3BentoCard>

          {/* Polish — narrow */}
          <V3BentoCard span={2} label="Polish" desc="Remove um, fix backtracks." beta>
            <div style={{ display:'flex', alignItems:'center', gap: 12 }}>
              <V3Toggle on={true} />
              <span className="mono" style={{ fontSize: 11, color: V3.LIME_DEEP, letterSpacing: '0.12em' }}>ENABLED</span>
            </div>
          </V3BentoCard>

          {/* Transcription engine — wide */}
          <V3BentoCard span={3} label="Transcription" desc="Where audio becomes text.">
            <V3Segment options={[
              { id: 'local', label: 'On-device', sub: 'whisper.cpp · base.en' },
              { id: 'cloud', label: 'Cloud',     sub: 'OpenAI · BYOK' },
            ]} active="local" />
          </V3BentoCard>

          {/* Model — wide */}
          <V3BentoCard span={3} label="Local model" desc="60 MB · Application Support.">
            <div style={{ display:'flex', alignItems:'center', gap: 12 }}>
              <V3ProgressBar percent={100} />
              <span className="mono" style={{ fontSize: 11, color: V3.LIME_DEEP, fontWeight: 500, letterSpacing:'0.06em' }}>DOWNLOADED</span>
              <div style={{ flex: 1 }} />
              <button style={V3GhostBtn}>Re-download</button>
            </div>
          </V3BentoCard>

          {/* API key — wide */}
          <V3BentoCard span={4} label="OpenAI API key" desc="Stored encrypted in macOS Keychain. Never logged.">
            <div style={{ display:'flex', alignItems:'center', gap: 10 }}>
              <div className="mono" style={{
                fontSize: 13, padding: '8px 12px', background: V3.PAPER, border: `1px solid ${V3.RULE}`,
                borderRadius: 8, color: V3.INK_SOFT, letterSpacing: '0.04em', flex: 1,
              }}>sk-…·M3vQ</div>
              <button style={V3ChipBtn}>Replace</button>
              <button style={{ ...V3GhostBtn, color: V3.BLUSH, borderColor: '#DD6E4E55' }}>Clear</button>
            </div>
          </V3BentoCard>

          {/* Mic — narrow */}
          <V3BentoCard span={2} label="Microphone" desc="Stays on internal mic.">
            <V3Dropdown value="Built-in" />
          </V3BentoCard>

          {/* Paste behavior — narrow */}
          <V3BentoCard span={2} label="Paste" desc="How text reaches the cursor.">
            <V3Segment compact options={[
              { id: 'cmdv', label: '⌘V' },
              { id: 'type', label: 'Type' },
            ]} active="cmdv" />
          </V3BentoCard>

          {/* Launch on login — narrow */}
          <V3BentoCard span={2} label="Launch on login" desc="Start with macOS.">
            <V3Toggle on={true} />
          </V3BentoCard>

          {/* Sounds — narrow */}
          <V3BentoCard span={2} label="Sounds" desc="Soft chimes on start / end.">
            <V3Toggle on={false} />
          </V3BentoCard>
        </div>
      </main>
    </V3MacWindow>
  );
}

function V3BentoCard({ children, label, desc, span = 2, beta }) {
  return (
    <div style={{
      gridColumn: `span ${span}`, background: V3.ELEVATED,
      border: `1px solid ${V3.RULE}`, borderRadius: 14, padding: '18px 20px',
      display:'flex', flexDirection:'column', gap: 14, minHeight: 130,
    }}>
      <div>
        <div style={{ display:'flex', alignItems:'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 14, color: V3.INK, fontWeight: 500 }}>{label}</span>
          {beta && <span className="mono" style={{
            fontSize: 9, padding: '2px 6px', background: V3.LIME_SOFT, color: V3.LIME_INK,
            border: `1px solid ${V3.LIME_DEEP}33`, borderRadius: 999, letterSpacing: '0.12em',
          }}>BETA</span>}
        </div>
        <div style={{ fontSize: 12, color: V3.MUTE, lineHeight: 1.45 }}>{desc}</div>
      </div>
      <div style={{ marginTop: 'auto' }}>{children}</div>
    </div>
  );
}

function V3KbdBig({ children }) {
  return (
    <span className="mono" style={{
      display:'inline-flex', alignItems:'center', justifyContent:'center',
      minWidth: 36, height: 32, padding: '0 9px',
      background: V3.CANVAS, border: `1px solid ${V3.RULE}`,
      borderBottom: `2px solid ${V3.RULE}`, borderRadius: 7,
      fontSize: 13, color: V3.INK, fontWeight: 500,
    }}>{children}</span>
  );
}

const V3ChipBtn = {
  background: V3.INK, color: V3.CANVAS, border: 'none', padding: '7px 14px',
  borderRadius: 7, fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer', fontWeight: 500,
};

const V3GhostBtn = {
  background: 'transparent', color: V3.INK_SOFT, border: `1px solid ${V3.RULE}`,
  padding: '6px 12px', borderRadius: 7, fontSize: 12,
  fontFamily: 'inherit', cursor: 'pointer',
};

function V3Segment({ options, active, compact }) {
  return (
    <div style={{
      display:'inline-flex', background: V3.PAPER, padding: 4, borderRadius: 10,
      border: `1px solid ${V3.RULE}`, gap: 4,
    }}>
      {options.map(o => {
        const isOn = o.id === active;
        return (
          <div key={o.id} style={{
            background: isOn ? V3.ELEVATED : 'transparent',
            border: isOn ? `1px solid ${V3.RULE}` : '1px solid transparent',
            padding: compact ? '5px 12px' : '7px 12px', borderRadius: 7,
            display:'flex', flexDirection:'column',
            boxShadow: isOn ? '0 1px 2px rgba(20,12,4,0.05)' : 'none',
          }}>
            <div style={{ fontSize: 12.5, fontWeight: 500, color: isOn ? V3.INK : V3.INK_SOFT }}>{o.label}</div>
            {o.sub && <div className="mono" style={{ fontSize: 10, color: V3.MUTE, letterSpacing:'0.04em' }}>{o.sub}</div>}
          </div>
        );
      })}
    </div>
  );
}

function V3ProgressBar({ percent }) {
  return (
    <div style={{ width: 120, height: 4, borderRadius: 999, background: V3.PAPER, overflow:'hidden', border:`1px solid ${V3.RULE_SOFT}` }}>
      <div style={{ width: `${percent}%`, height: '100%', background: V3.LIME_DEEP, borderRadius: 999 }} />
    </div>
  );
}

function V3Dropdown({ value }) {
  return (
    <div style={{
      display:'inline-flex', alignItems:'center', gap: 12,
      padding: '7px 11px', background: V3.CANVAS, border: `1px solid ${V3.RULE}`,
      borderRadius: 7, fontSize: 12.5, color: V3.INK, width: '100%', justifyContent:'space-between',
    }}>
      <span>{value}</span>
      <svg width="10" height="6" viewBox="0 0 10 6"><path d="M1 1l4 4 4-4" stroke={V3.MUTE} strokeWidth="1.4" fill="none" strokeLinecap="round" /></svg>
    </div>
  );
}

// ============== FLOATING PILL (light) ==============
function V3PillArtboard() {
  return (
    <div style={{
      width: 1100, height: 700,
      background: `radial-gradient(120% 80% at 50% 100%, ${V3.PAPER} 0%, ${V3.CANVAS} 80%)`,
      padding: 40, boxSizing:'border-box',
      display:'flex', flexDirection:'column', gap: 24, position:'relative', overflow:'hidden',
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <V3Eyebrow text="05 — Floating pill" />
        <div className="mono" style={{ fontSize: 11, color: V3.MUTE, letterSpacing: '0.12em' }}>
          height 48 · radius 28 · always on top
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns: '1fr 1fr', gap: 18, flex: 1 }}>
        <V3PillSlot caption="Idle · hint only"><V3PillIdle /></V3PillSlot>
        <V3PillSlot caption="Listening · live levels" accent><V3PillRecording /></V3PillSlot>
        <V3PillSlot caption="Transcribing · whisper running"><V3PillTranscribing /></V3PillSlot>
        <V3PillSlot caption="Pasted · brief confirm, then fades"><V3PillPasted /></V3PillSlot>
      </div>

      <div style={{ fontSize: 13.5, color: V3.INK_SOFT, maxWidth: 720, lineHeight: 1.5 }}>
        The chartreuse fill is the only state-color in the system — <span style={{ color: V3.LIME_DEEP, fontWeight: 500 }}>when you see it, the mic is open.</span>
      </div>
    </div>
  );
}

function V3PillSlot({ caption, children, accent }) {
  return (
    <div style={{
      background: V3.ELEVATED, borderRadius: 14, border: `1px solid ${V3.RULE}`,
      padding: 22, display:'flex', flexDirection:'column', gap: 16,
      alignItems:'center', justifyContent:'center', minHeight: 0,
    }}>
      <div style={{ flex: 1, display:'flex', alignItems:'center', justifyContent:'center' }}>
        {children}
      </div>
      <div style={{ display:'flex', alignItems:'center', gap: 8 }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: accent ? V3.LIME_DEEP : V3.MUTE,
        }} />
        <div className="mono" style={{ fontSize: 11, color: V3.MUTE, letterSpacing: '0.08em' }}>{caption}</div>
      </div>
    </div>
  );
}

function V3PillBase({ children, bg = V3.INK, color = V3.CANVAS, border }) {
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

function V3PillIdle() {
  return (
    <V3PillBase>
      <V3MicGlyph size={17} color={V3.CANVAS} />
      <span style={{ opacity: 0.85 }}>Hold</span>
      <span className="mono" style={{
        padding: '2px 7px', background: 'rgba(255,255,255,0.12)', borderRadius: 5,
        fontSize: 11, letterSpacing: '0.06em',
      }}>fn</span>
      <span style={{ opacity: 0.6, marginLeft: 2 }}>to talk</span>
    </V3PillBase>
  );
}

function V3PillRecording() {
  return (
    <V3PillBase bg={V3.LIME} color={V3.LIME_INK} border={V3.LIME_DEEP}>
      <span style={{ position:'relative', display:'inline-flex', alignItems:'center', justifyContent:'center', width: 16, height: 16 }}>
        <span style={{ width: 10, height: 10, borderRadius:'50%', background: V3.LIME_INK }} />
      </span>
      <VoiceBars3 count={14} width={130} height={26} color={V3.LIME_INK} animated />
      <span className="mono" style={{ fontSize: 11, letterSpacing:'0.06em', color: V3.LIME_INK, opacity: 0.8 }}>0:04</span>
    </V3PillBase>
  );
}

function V3PillTranscribing() {
  return (
    <V3PillBase bg={V3.ELEVATED} color={V3.INK} border={V3.RULE}>
      <V3SpinnerDots />
      <span>Transcribing</span>
      <span className="mono" style={{
        padding: '2px 7px', background: V3.PAPER, borderRadius: 5,
        fontSize: 10, letterSpacing: '0.08em', color: V3.MUTE, marginLeft: 4,
        border: `1px solid ${V3.RULE}`,
      }}>WHISPER.BASE</span>
    </V3PillBase>
  );
}

function V3SpinnerDots() {
  return (
    <span style={{ display:'inline-flex', gap: 5, alignItems:'center' }}>
      {[0,1,2].map(i => (
        <span key={i} style={{
          width: 6, height: 6, borderRadius:'50%', background: V3.LIME_DEEP,
          animation: `v3dot 1.1s ${i*0.15}s infinite ease-in-out`,
        }} />
      ))}
      <style>{`@keyframes v3dot{0%,100%{opacity:0.3;transform:translateY(0)}50%{opacity:1;transform:translateY(-3px)}}`}</style>
    </span>
  );
}

function V3PillPasted() {
  return (
    <V3PillBase bg={V3.ELEVATED} color={V3.INK} border={V3.RULE}>
      <V3CheckIcon />
      <span>Pasted</span>
      <span style={{ color: V3.MUTE, fontSize: 12 }}>· 38 words to Slack</span>
    </V3PillBase>
  );
}

function V3CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" stroke={V3.LIME_DEEP} strokeWidth="1.4" opacity="0.5" />
      <path d="M5 8l2 2 4-4" stroke={V3.LIME_DEEP} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function V3MicGlyph({ size=22, color=V3.INK }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="9" y="3" width="6" height="11" rx="3" stroke={color} strokeWidth="1.5" />
      <path d="M5 11a7 7 0 0 0 14 0" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 18v3" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

Object.assign(window, {
  V3MacWindow, V3TopNav,
  V3HomeArtboard, V3SettingsArtboard, V3PillArtboard,
});
