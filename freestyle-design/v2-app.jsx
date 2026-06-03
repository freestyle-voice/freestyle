// Freestyle — After Hours app UI: Home, Settings, Floating Pill states.
// Wrapped in macOS window chrome.

// ============== WINDOW CHROME ==============
function V2MacWindow({ width=1100, height=720, title='Freestyle', children, bg=V2.VOID }) {
  return (
    <div style={{
      width, height, background: bg, borderRadius: 14, overflow: 'hidden',
      boxShadow: '0 30px 80px -20px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
      display: 'flex', flexDirection: 'column',
      border: `1px solid ${V2.RULE}`,
    }}>
      <div style={{
        height: 36, background: V2.INK, display: 'flex', alignItems: 'center',
        padding: '0 14px', gap: 8, borderBottom: `1px solid ${V2.RULE}`,
      }}>
        <span style={{ width:11, height:11, borderRadius:'50%', background:'#3A3640', border:`1px solid ${V2.RULE}` }} />
        <span style={{ width:11, height:11, borderRadius:'50%', background:'#3A3640', border:`1px solid ${V2.RULE}` }} />
        <span style={{ width:11, height:11, borderRadius:'50%', background:'#3A3640', border:`1px solid ${V2.RULE}` }} />
        <div style={{ flex: 1, textAlign:'center', fontSize: 11.5, color: V2.MUTE, letterSpacing: '0.04em' }}>{title}</div>
        <div style={{ width: 52 }} />
      </div>
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>{children}</div>
    </div>
  );
}

// ============== SIDEBAR ==============
function V2Sidebar({ active='home' }) {
  const items = [
    { id:'home',       label:'Home',       icon: <NavHome /> },
    { id:'history',    label:'History',    icon: <NavClock /> },
    { id:'dictionary', label:'Dictionary', icon: <NavBook /> },
    { id:'settings',   label:'Settings',   icon: <NavGear /> },
  ];
  return (
    <aside style={{
      width: 220, background: V2.INK, borderRight: `1px solid ${V2.RULE}`,
      padding: '20px 14px', display:'flex', flexDirection:'column', gap: 4,
    }}>
      <div style={{ padding: '4px 8px 22px', display:'flex', alignItems:'center', gap: 8 }}>
        <MarkSlash size={22} />
        <V2Wordmark size={22} color={V2.TEXT} accent={V2.LIME} glow={false} />
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap: 2 }}>
        {items.map(it => (
          <div key={it.id} style={{
            display:'flex', alignItems:'center', gap: 10, padding: '8px 10px',
            borderRadius: 8, fontSize: 13.5, color: active===it.id ? V2.TEXT : V2.TEXT_SOFT,
            background: active===it.id ? V2.SURFACE : 'transparent',
            fontWeight: active===it.id ? 500 : 400,
            border: active===it.id ? `1px solid ${V2.RULE}` : '1px solid transparent',
            cursor: 'default',
          }}>
            <span style={{ color: active===it.id ? V2.LIME : V2.MUTE, display:'inline-flex' }}>{it.icon}</span>
            {it.label}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 'auto', padding: '12px 10px 0', borderTop: `1px solid ${V2.RULE}` }}>
        <div className="mono" style={{ fontSize: 10, color: V2.MUTE, letterSpacing: '0.12em', textTransform:'uppercase' }}>v0.1 · alpha</div>
        <div style={{ fontSize: 12, color: V2.TEXT_SOFT, marginTop: 4 }}>local · whisper.base.en</div>
        <div style={{ display:'flex', alignItems:'center', gap: 6, marginTop: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius:'50%', background: V2.LIME, boxShadow:`0 0 6px ${V2.LIME}` }} />
          <span className="mono" style={{ fontSize: 10, color: V2.LIME, letterSpacing:'0.08em' }}>READY</span>
        </div>
      </div>
    </aside>
  );
}

function NavHome() { return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M2.5 7.5l5.5-5 5.5 5v6a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1v-6z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>; }
function NavClock() { return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4"/><path d="M8 5v3l2 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>; }
function NavBook() { return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M3 3.5h4.5a1.5 1.5 0 0 1 1.5 1.5V13a1 1 0 0 0-1-1H3v-8.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="M13 3.5H8.5A1.5 1.5 0 0 0 7 5V13a1 1 0 0 1 1-1h5v-8.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>; }
function NavGear() { return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.4"/><path d="M8 1.5v2M8 12.5v2M14.5 8h-2M3.5 8h-2M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4M12.6 12.6l-1.4-1.4M4.8 4.8L3.4 3.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>; }

// ============== HOME ==============
function V2HomeArtboard() {
  return (
    <V2MacWindow width={1100} height={720} title="Freestyle">
      <V2Sidebar active="home" />
      <main style={{
        flex: 1, padding: '52px 60px', display:'flex', flexDirection:'column',
        gap: 32, overflow: 'hidden', position: 'relative', background: V2.VOID,
      }}>
        {/* faint scope behind headline */}
        <div style={{ position:'absolute', top: 60, right: -40, opacity: 0.6 }}>
          <ScopeTrace width={420} height={70} weight={1.2} cycles={4} opacity={0.65} />
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap: 10 }}>
          <div style={{ display:'flex', alignItems:'center', gap: 14 }}>
            <V2Eyebrow text="Tuesday · 11:42 pm" />
          </div>
          <h1 style={{ margin: 0 }}>
            <span className="serif" style={{
              fontSize: 92, fontWeight: 400, color: V2.TEXT,
              letterSpacing: '-0.025em', lineHeight: 0.95,
            }}>Hold </span>
            <span className="serif-italic glow-lime" style={{
              fontSize: 92, color: V2.LIME, lineHeight: 0.95,
            }}>fn</span>
            <span className="serif" style={{ fontSize: 92, color: V2.TEXT, lineHeight: 0.95 }}>, speak,</span>
            <br />
            <span className="serif-italic" style={{
              fontSize: 92, color: V2.TEXT, lineHeight: 0.95,
            }}>release.</span>
          </h1>
        </div>

        {/* listening card */}
        <div style={{
          background: V2.INK, borderRadius: 16, border: `1px solid ${V2.RULE}`,
          padding: 22, display:'flex', alignItems:'center', gap: 22, position:'relative', overflow:'hidden',
        }}>
          {/* pulse ring on left */}
          <div style={{
            width: 56, height: 56, borderRadius: '50%', background: V2.SURFACE,
            display:'flex', alignItems:'center', justifyContent:'center',
            border: `1px solid ${V2.RULE}`, flexShrink: 0,
          }}>
            <V2MicGlyph size={22} color={V2.TEXT} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15.5, fontWeight: 500, color: V2.TEXT, marginBottom: 4 }}>Ready when you are.</div>
            <div style={{ fontSize: 13, color: V2.TEXT_SOFT }}>
              Hold <V2Kbd>fn</V2Kbd> anywhere — the cursor doesn't have to be here.
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap: 8, fontSize: 11.5, color: V2.LIME, fontWeight: 500 }} className="mono">
            <span style={{
              width: 7, height: 7, borderRadius: '50%', background: V2.LIME,
              boxShadow: `0 0 8px ${V2.LIME}`,
            }} />
            MIC OK
          </div>
        </div>

        {/* last transcript */}
        <div style={{ display:'flex', flexDirection:'column', gap: 16 }}>
          <div style={{ display:'flex', alignItems:'center', gap: 12 }}>
            <div className="mono" style={{ fontSize: 11, letterSpacing: '0.16em', textTransform:'uppercase', color: V2.MUTE }}>
              Last transcript
            </div>
            <div style={{ flex: 1, height: 1, background: V2.RULE }} />
            <div className="mono" style={{ fontSize: 11, color: V2.MUTE, letterSpacing:'0.06em' }}>2 min ago · 14s · 38 words</div>
          </div>
          <div style={{ display:'flex', gap: 18, alignItems:'flex-start' }}>
            <div style={{
              width: 6, alignSelf:'stretch', background: V2.LIME, borderRadius: 4,
              boxShadow: `0 0 14px ${V2.LIME}aa`, marginTop: 4, marginBottom: 4, flexShrink: 0,
            }} />
            <p className="serif-italic" style={{
              margin: 0, fontSize: 28, color: V2.TEXT, lineHeight: 1.35,
              maxWidth: 760, textWrap: 'pretty',
            }}>
              “Could you push the meeting from two to three? Actually, let's make it tomorrow at ten — easier on everyone.”
            </p>
          </div>

          <div style={{ display:'flex', gap: 8, marginLeft: 24, marginTop: 4 }}>
            <V2Tag>slack</V2Tag>
            <V2Tag>casual tone</V2Tag>
            <V2Tag>1 backtrack fixed</V2Tag>
          </div>
        </div>

        {/* footer stats */}
        <div style={{
          marginTop: 'auto', display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap: 22,
          borderTop: `1px solid ${V2.RULE}`, paddingTop: 22,
        }}>
          <V2Stat n="1,284" l="words today" />
          <V2Stat n="4.2×" l="faster than typing" />
          <V2Stat n="98%" l="local — no cloud" accent />
        </div>
      </main>
    </V2MacWindow>
  );
}

function V2Kbd({ children }) {
  return (
    <span className="mono" style={{
      display:'inline-flex', alignItems:'center', padding: '2px 7px',
      background: V2.SURFACE2, border: `1px solid ${V2.RULE}`, borderRadius: 5,
      fontSize: 11, color: V2.TEXT, fontWeight: 500,
    }}>{children}</span>
  );
}

function V2Tag({ children }) {
  return (
    <span className="mono" style={{
      fontSize: 10, padding: '4px 9px', background: 'transparent',
      border: `1px solid ${V2.RULE}`, color: V2.TEXT_SOFT, borderRadius: 999,
      letterSpacing: '0.08em', textTransform: 'uppercase',
    }}>{children}</span>
  );
}

function V2Stat({ n, l, accent }) {
  return (
    <div>
      <div className="serif-italic" style={{
        fontSize: 46, color: accent ? V2.LIME : V2.TEXT, lineHeight: 1,
        textShadow: accent ? `0 0 22px ${V2.LIME}55` : 'none',
      }}>{n}</div>
      <div className="mono" style={{ fontSize: 11, color: V2.MUTE, marginTop: 8, letterSpacing: '0.08em', textTransform:'uppercase' }}>{l}</div>
    </div>
  );
}

function V2MicGlyph({ size=22, color=V2.TEXT }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="9" y="3" width="6" height="11" rx="3" stroke={color} strokeWidth="1.5" />
      <path d="M5 11a7 7 0 0 0 14 0" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
      <path d="M12 18v3" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// ============== SETTINGS ==============
function V2SettingsArtboard() {
  return (
    <V2MacWindow width={1100} height={720} title="Freestyle — Settings">
      <V2Sidebar active="settings" />
      <main style={{
        flex: 1, padding: '48px 60px', display:'flex', flexDirection:'column',
        gap: 28, overflow: 'auto', background: V2.VOID, position:'relative',
      }}>
        <div>
          <V2Eyebrow text="Settings" />
          <h1 className="serif" style={{
            margin: '14px 0 0', fontSize: 64, color: V2.TEXT, lineHeight: 0.95, letterSpacing: '-0.025em',
          }}>
            Make it <span className="serif-italic" style={{ color: V2.LIME }}>yours.</span>
          </h1>
        </div>

        <V2SettingsRow label="Hotkey" desc="Hold to record, release to transcribe.">
          <div style={{ display:'flex', gap: 10, alignItems:'center' }}>
            <V2KbdBig>fn</V2KbdBig>
            <span style={{ fontSize: 12, color: V2.MUTE }}>or</span>
            <V2KbdBig>⌃</V2KbdBig><V2KbdBig>space</V2KbdBig>
            <button style={V2ChipBtn}>Change</button>
          </div>
        </V2SettingsRow>

        <V2SettingsRow label="Transcription" desc="Where audio is turned into text.">
          <V2Segment options={[
            { id: 'local', label: 'On-device', sub: 'whisper.cpp · base.en' },
            { id: 'cloud', label: 'Cloud',     sub: 'OpenAI · BYOK' },
          ]} active="local" />
        </V2SettingsRow>

        <V2SettingsRow label="Local model" desc="60 MB, lives in Application Support.">
          <div style={{ display:'flex', alignItems:'center', gap: 14 }}>
            <V2ProgressBar percent={100} />
            <div className="mono" style={{ fontSize: 11, color: V2.LIME, fontWeight: 500, letterSpacing:'0.06em' }}>DOWNLOADED</div>
            <button style={V2GhostBtn}>Re-download</button>
          </div>
        </V2SettingsRow>

        <V2SettingsRow label="Polish layer" desc="Optional LLM cleanup — removes 'um', resolves backtracks, fixes punctuation." beta>
          <V2Toggle on={true} />
        </V2SettingsRow>

        <V2SettingsRow label="OpenAI API key" desc="Stored encrypted in macOS Keychain. Never logged.">
          <div style={{ display:'flex', alignItems:'center', gap: 10 }}>
            <div className="mono" style={{
              fontSize: 13, padding: '8px 12px', background: V2.SURFACE, border: `1px solid ${V2.RULE}`,
              borderRadius: 8, color: V2.TEXT_SOFT, letterSpacing: '0.04em',
            }}>sk-…·M3vQ</div>
            <button style={V2ChipBtn}>Replace</button>
            <button style={{ ...V2GhostBtn, color: V2.BLUSH, borderColor: 'rgba(232,146,124,0.3)' }}>Clear</button>
          </div>
        </V2SettingsRow>

        <V2SettingsRow label="Microphone" desc="Pin to internal mic so Bluetooth headphones stay high-quality.">
          <V2Dropdown value="MacBook Pro Microphone" />
        </V2SettingsRow>
      </main>
    </V2MacWindow>
  );
}

function V2SettingsRow({ label, desc, children, beta }) {
  return (
    <div style={{
      display:'grid', gridTemplateColumns: '280px 1fr', gap: 32,
      paddingBottom: 22, borderBottom: `1px solid ${V2.RULE}`,
      alignItems: 'flex-start',
    }}>
      <div>
        <div style={{ display:'flex', alignItems:'center', gap: 8, marginBottom: 4 }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: V2.TEXT }}>{label}</div>
          {beta && <span className="mono" style={{
            fontSize: 9, padding: '2px 6px', background: V2.LIME_SOFT, color: V2.LIME,
            border: `1px solid ${V2.LIME_DEEP}33`, borderRadius: 999, letterSpacing: '0.12em',
          }}>BETA</span>}
        </div>
        <div style={{ fontSize: 12.5, color: V2.TEXT_SOFT, lineHeight: 1.5, maxWidth: 260 }}>{desc}</div>
      </div>
      <div>{children}</div>
    </div>
  );
}

function V2KbdBig({ children }) {
  return (
    <span className="mono" style={{
      display:'inline-flex', alignItems:'center', justifyContent:'center',
      minWidth: 36, height: 32, padding: '0 9px',
      background: V2.SURFACE, border: `1px solid ${V2.RULE}`,
      borderBottom: `2px solid ${V2.RULE}`, borderRadius: 7,
      fontSize: 13, color: V2.TEXT, fontWeight: 500,
    }}>{children}</span>
  );
}

const V2ChipBtn = {
  background: V2.LIME, color: V2.VOID, border: 'none', padding: '7px 14px',
  borderRadius: 7, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', fontWeight: 500,
  boxShadow: `0 0 18px ${V2.LIME}44`,
};

const V2GhostBtn = {
  background: 'transparent', color: V2.TEXT_SOFT, border: `1px solid ${V2.RULE}`,
  padding: '6px 12px', borderRadius: 7, fontSize: 12.5,
  fontFamily: 'inherit', cursor: 'pointer',
};

function V2Segment({ options, active }) {
  return (
    <div style={{
      display:'inline-flex', background: V2.INK, padding: 4, borderRadius: 10,
      border: `1px solid ${V2.RULE}`, gap: 4,
    }}>
      {options.map(o => {
        const isOn = o.id === active;
        return (
          <div key={o.id} style={{
            background: isOn ? V2.SURFACE2 : 'transparent',
            border: isOn ? `1px solid ${V2.RULE}` : '1px solid transparent',
            padding: '8px 14px', borderRadius: 7,
            display:'flex', flexDirection:'column',
          }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: isOn ? V2.TEXT : V2.TEXT_SOFT }}>{o.label}</div>
            <div className="mono" style={{ fontSize: 10, color: V2.MUTE, letterSpacing:'0.04em' }}>{o.sub}</div>
          </div>
        );
      })}
    </div>
  );
}

function V2ProgressBar({ percent }) {
  return (
    <div style={{ width: 160, height: 4, borderRadius: 999, background: V2.SURFACE, overflow:'hidden', border:`1px solid ${V2.RULE}` }}>
      <div style={{
        width: `${percent}%`, height: '100%', background: V2.LIME, borderRadius: 999,
        boxShadow: `0 0 12px ${V2.LIME}88`,
      }} />
    </div>
  );
}

function V2Toggle({ on }) {
  return (
    <div style={{
      width: 44, height: 26, borderRadius: 999,
      background: on ? V2.LIME : V2.SURFACE,
      border: `1px solid ${on ? V2.LIME_DEEP : V2.RULE}`,
      position: 'relative', transition: 'background 0.18s',
      boxShadow: on ? `0 0 14px ${V2.LIME}66` : 'none',
    }}>
      <div style={{
        width: 20, height: 20, borderRadius: '50%', background: on ? V2.VOID : V2.TEXT_SOFT,
        position: 'absolute', top: 2, left: on ? 21 : 2,
        transition: 'left 0.18s',
      }} />
    </div>
  );
}

function V2Dropdown({ value }) {
  return (
    <div style={{
      display:'inline-flex', alignItems:'center', gap: 12,
      padding: '8px 12px', background: V2.SURFACE, border: `1px solid ${V2.RULE}`,
      borderRadius: 8, fontSize: 13, color: V2.TEXT, minWidth: 280, justifyContent:'space-between',
    }}>
      <span>{value}</span>
      <svg width="10" height="6" viewBox="0 0 10 6"><path d="M1 1l4 4 4-4" stroke={V2.MUTE} strokeWidth="1.4" fill="none" strokeLinecap="round" /></svg>
    </div>
  );
}

// ============== FLOATING PILL ==============
function V2PillArtboard() {
  return (
    <div style={{
      width: 1100, height: 700,
      // dim "desktop" backdrop — radial vignette for depth
      background: `radial-gradient(120% 80% at 50% 100%, ${V2.INK} 0%, ${V2.VOID} 80%)`,
      padding: 40, boxSizing:'border-box',
      display:'flex', flexDirection:'column', gap: 24, position:'relative', overflow:'hidden',
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <V2Eyebrow text="05 — Floating pill" />
        <div className="mono" style={{ fontSize: 11, color: V2.MUTE, letterSpacing: '0.1em' }}>
          height 48 · radius 28 · always on top
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns: '1fr 1fr', gap: 18, flex: 1 }}>
        <V2PillSlot caption="Idle · hint only">
          <V2PillIdle />
        </V2PillSlot>
        <V2PillSlot caption="Listening · live levels" accent>
          <V2PillRecording />
        </V2PillSlot>
        <V2PillSlot caption="Transcribing · whisper running">
          <V2PillTranscribing />
        </V2PillSlot>
        <V2PillSlot caption="Pasted · brief confirm, then fades">
          <V2PillPasted />
        </V2PillSlot>
      </div>

      <div style={{ fontSize: 13, color: V2.TEXT_SOFT, maxWidth: 720, lineHeight: 1.5 }}>
        The chartreuse fill is the only state-color in the system — <span style={{ color: V2.LIME }}>when you see it, the mic is open.</span>
      </div>
    </div>
  );
}

function V2PillSlot({ caption, children, accent }) {
  return (
    <div style={{
      background: V2.INK, borderRadius: 14, border: `1px solid ${V2.RULE}`,
      padding: 22, display:'flex', flexDirection:'column', gap: 16,
      alignItems:'center', justifyContent:'center', minHeight: 0, position:'relative',
    }}>
      <div style={{ flex: 1, display:'flex', alignItems:'center', justifyContent:'center' }}>
        {children}
      </div>
      <div style={{ display:'flex', alignItems:'center', gap: 8 }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: accent ? V2.LIME : V2.MUTE,
          boxShadow: accent ? `0 0 8px ${V2.LIME}` : 'none',
        }} />
        <div className="mono" style={{ fontSize: 11, color: V2.MUTE, letterSpacing: '0.08em' }}>{caption}</div>
      </div>
    </div>
  );
}

function V2PillBase({ children, bg=V2.INK, color=V2.TEXT, border, glow }) {
  return (
    <div style={{
      height: 48, padding: '0 18px', borderRadius: 28,
      background: bg, color, display:'inline-flex', alignItems:'center', gap: 12,
      border: `1px solid ${border || V2.RULE}`,
      boxShadow: glow
        ? `0 0 40px ${glow}88, 0 0 0 1px ${glow}44, 0 8px 22px -6px rgba(0,0,0,0.6)`
        : '0 8px 24px -6px rgba(0,0,0,0.7)',
      fontFamily: 'DM Sans', fontSize: 14, fontWeight: 500,
    }}>
      {children}
    </div>
  );
}

function V2PillIdle() {
  return (
    <V2PillBase>
      <V2MicGlyph size={17} color={V2.TEXT_SOFT} />
      <span style={{ color: V2.TEXT_SOFT }}>Hold</span>
      <span className="mono" style={{
        padding: '2px 7px', background: V2.SURFACE2, borderRadius: 5,
        fontSize: 11, letterSpacing: '0.06em', color: V2.TEXT, border: `1px solid ${V2.RULE}`,
      }}>fn</span>
      <span style={{ color: V2.MUTE, marginLeft: 2 }}>to talk</span>
    </V2PillBase>
  );
}

function V2PillRecording() {
  return (
    <V2PillBase bg={V2.LIME} color={V2.VOID} border={V2.LIME} glow={V2.LIME}>
      <span style={{ position:'relative', display:'inline-flex', alignItems:'center', justifyContent:'center', width: 16, height: 16 }}>
        <span style={{ width: 10, height: 10, borderRadius:'50%', background: V2.VOID }} />
      </span>
      <VoiceBars count={14} width={130} height={26} color={V2.VOID} glow={false} animated />
      <span className="mono" style={{ fontSize: 11, letterSpacing:'0.06em', color: V2.VOID, opacity: 0.8 }}>0:04</span>
    </V2PillBase>
  );
}

function V2PillTranscribing() {
  return (
    <V2PillBase>
      <V2SpinnerDots />
      <span>Transcribing</span>
      <span className="mono" style={{
        padding: '2px 7px', background: V2.SURFACE2, borderRadius: 5,
        fontSize: 10, letterSpacing: '0.08em', color: V2.TEXT_SOFT, marginLeft: 4,
        border: `1px solid ${V2.RULE}`,
      }}>WHISPER.BASE</span>
    </V2PillBase>
  );
}

function V2SpinnerDots() {
  return (
    <span style={{ display:'inline-flex', gap: 5, alignItems:'center' }}>
      {[0,1,2].map(i => (
        <span key={i} style={{
          width: 6, height: 6, borderRadius:'50%', background: V2.LIME,
          boxShadow: `0 0 6px ${V2.LIME}`,
          animation: `v2dot 1.1s ${i*0.15}s infinite ease-in-out`,
        }} />
      ))}
      <style>{`@keyframes v2dot{0%,100%{opacity:0.3;transform:translateY(0)}50%{opacity:1;transform:translateY(-3px)}}`}</style>
    </span>
  );
}

function V2PillPasted() {
  return (
    <V2PillBase>
      <V2CheckIcon />
      <span>Pasted</span>
      <span style={{ color: V2.MUTE, fontSize: 12 }}>· 38 words to Slack</span>
    </V2PillBase>
  );
}

function V2CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ filter: `drop-shadow(0 0 6px ${V2.LIME}88)` }}>
      <circle cx="8" cy="8" r="7" stroke={V2.LIME} strokeWidth="1.4" opacity="0.4" />
      <path d="M5 8l2 2 4-4" stroke={V2.LIME} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

Object.assign(window, {
  V2MacWindow, V2Sidebar,
  V2HomeArtboard, V2SettingsArtboard, V2PillArtboard,
});
