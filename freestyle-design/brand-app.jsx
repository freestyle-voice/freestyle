// Freestyle — app UI mocks: Home, Settings, Floating Pill (states).
// Wrapped in a macOS window chrome.

// ============== WINDOW CHROME ==============
function MacWindow({ width=900, height=600, title='Freestyle', children, bg=PAPER }) {
  return (
    <div style={{
      width, height, background: bg, borderRadius: 14, overflow: 'hidden',
      boxShadow: '0 24px 60px -20px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.06)',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        height: 36, background: PAPER_DEEP, display: 'flex', alignItems: 'center',
        padding: '0 14px', gap: 8, borderBottom: `1px solid ${RULE}`,
      }}>
        <span style={{ width:12, height:12, borderRadius:'50%', background:'#FF5F57' }}></span>
        <span style={{ width:12, height:12, borderRadius:'50%', background:'#FEBC2E' }}></span>
        <span style={{ width:12, height:12, borderRadius:'50%', background:'#28C840' }}></span>
        <div style={{ flex: 1, textAlign:'center', fontSize: 12, color: MUTE, letterSpacing: '0.02em' }}>{title}</div>
        <div style={{ width: 52 }} />
      </div>
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>{children}</div>
    </div>
  );
}

// ============== SIDEBAR ==============
function Sidebar({ active='home' }) {
  const items = [
    { id:'home', label:'Home', icon: <SidebarHomeIcon /> },
    { id:'history', label:'History', icon: <SidebarHistoryIcon /> },
    { id:'dictionary', label:'Dictionary', icon: <SidebarBookIcon /> },
    { id:'settings', label:'Settings', icon: <SidebarGearIcon /> },
  ];
  return (
    <aside style={{
      width: 220, background: PAPER_DEEP, borderRight: `1px solid ${RULE}`,
      padding: '20px 14px', display:'flex', flexDirection:'column', gap: 4,
    }}>
      <div style={{ padding: '4px 8px 18px', display:'flex', alignItems:'center', gap: 10 }}>
        <MarkResolve size={26} color={INK} />
        <Wordmark size={20} color={INK} accent={CORAL} />
      </div>
      {items.map(it => (
        <div key={it.id} style={{
          display:'flex', alignItems:'center', gap: 10, padding: '8px 10px',
          borderRadius: 8, fontSize: 14, color: active===it.id ? INK : INK_SOFT,
          background: active===it.id ? PAPER : 'transparent',
          fontWeight: active===it.id ? 600 : 450,
          border: active===it.id ? `1px solid ${RULE}` : '1px solid transparent',
          cursor: 'default',
        }}>
          <span style={{ color: active===it.id ? CORAL : MUTE, display:'inline-flex' }}>{it.icon}</span>
          {it.label}
        </div>
      ))}
      <div style={{ marginTop: 'auto', padding: '12px 10px 0', borderTop: `1px solid ${RULE}` }}>
        <div className="mono" style={{ fontSize: 10, color: MUTE, letterSpacing: '0.1em', textTransform:'uppercase' }}>v0.1 · alpha</div>
        <div style={{ fontSize: 12, color: MUTE, marginTop: 4 }}>local · whisper.base.en</div>
      </div>
    </aside>
  );
}

function SidebarHomeIcon() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2.5 7.5l5.5-5 5.5 5v6a1 1 0 0 1-1 1H3.5a1 1 0 0 1-1-1v-6z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>;
}
function SidebarHistoryIcon() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4"/><path d="M8 5v3l2 1.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>;
}
function SidebarBookIcon() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M3 3.5h6a2 2 0 0 1 2 2V13a1.5 1.5 0 0 0-1.5-1.5H3v-8z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/><path d="M13 3.5H9a2 2 0 0 0-2 2V13a1.5 1.5 0 0 1 1.5-1.5H13v-8z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>;
}
function SidebarGearIcon() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="2.2" stroke="currentColor" strokeWidth="1.4"/><path d="M8 1.5v2M8 12.5v2M14.5 8h-2M3.5 8h-2M12.6 3.4l-1.4 1.4M4.8 11.2l-1.4 1.4M12.6 12.6l-1.4-1.4M4.8 4.8L3.4 3.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>;
}

// ============== HOME PAGE ==============
function HomeArtboard() {
  return (
    <MacWindow width={1100} height={720} title="Freestyle">
      <Sidebar active="home" />
      <main style={{
        flex: 1, padding: '56px 64px', display:'flex', flexDirection:'column',
        gap: 36, overflow: 'hidden', position: 'relative',
      }}>
        {/* decorative voice line */}
        <div style={{ position:'absolute', top: 28, right: -20, opacity: 0.55 }}>
          <Squiggle width={260} height={42} stroke={INK} weight={2.5} />
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap: 8 }}>
          <div className="mono" style={{ fontSize: 11, letterSpacing: '0.12em', textTransform:'uppercase', color: MUTE }}>
            Tuesday, May 26
          </div>
          <h1 className="display" style={{
            margin: 0, fontSize: 84, fontWeight: 700, lineHeight: 0.9,
            letterSpacing: '-0.035em', fontVariationSettings: `'wdth' 85, 'opsz' 96`,
          }}>
            Hold <span style={{
              position:'relative',
              fontStyle: 'italic', fontWeight: 500, color: INK,
              fontVariationSettings: `'wdth' 100`,
            }}>
              fn
              <span style={{ position:'absolute', left:0, right:0, bottom: -10 }}>
                <Underwave width={130} height={14} color={CORAL} weight={3.5} />
              </span>
            </span>, speak,<br />release.
          </h1>
        </div>

        {/* listening card */}
        <div style={{
          background: '#FFFFFF', borderRadius: 16, border: `1px solid ${RULE}`,
          padding: 22, display:'flex', alignItems:'center', gap: 22,
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%', background: PAPER_DEEP,
            display:'flex', alignItems:'center', justifyContent:'center',
            border: `1px solid ${RULE}`,
          }}>
            <MicGlyph color={INK} size={24} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: INK, marginBottom: 4 }}>Ready when you are</div>
            <div style={{ fontSize: 13, color: MUTE }}>Hold <Kbd>fn</Kbd> anywhere — the cursor doesn't have to be here.</div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap: 10, fontSize: 12, color: SAGE, fontWeight: 600 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: SAGE }} />
            Mic OK
          </div>
        </div>

        {/* last transcript */}
        <div style={{ display:'flex', flexDirection:'column', gap: 14 }}>
          <div style={{ display:'flex', alignItems:'center', gap: 10 }}>
            <div className="mono" style={{ fontSize: 11, letterSpacing: '0.12em', textTransform:'uppercase', color: MUTE }}>
              Last transcript
            </div>
            <div style={{ flex: 1, height: 1, background: RULE }} />
            <div className="mono" style={{ fontSize: 11, color: MUTE }}>2 min ago · 14s · 38 words</div>
          </div>
          <div style={{ display:'flex', gap: 18, alignItems:'flex-start' }}>
            <QuoteCurls size={56} stroke={INK} color2={CORAL} weight={3.5} style={{ marginTop: 6, flexShrink:0 }} />
            <p className="display" style={{
              margin: 0, fontSize: 26, fontWeight: 450, lineHeight: 1.35, color: INK_SOFT,
              fontVariationSettings: `'wdth' 95, 'opsz' 36`,
              fontStyle: 'italic', maxWidth: 760, textWrap: 'pretty',
            }}>
              Could you push the meeting from two to three? Actually, let's make it tomorrow at ten — easier on everyone.
            </p>
          </div>

          <div style={{ display:'flex', gap: 8, marginLeft: 74, marginTop: 6 }}>
            <Tag>slack</Tag>
            <Tag>casual tone</Tag>
            <Tag>1 backtrack fixed</Tag>
          </div>
        </div>

        {/* footer stats */}
        <div style={{
          marginTop: 'auto', display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap: 20,
          borderTop: `1px solid ${RULE}`, paddingTop: 20,
        }}>
          <Stat n="1,284" l="words today" />
          <Stat n="4.2×" l="faster than typing" />
          <Stat n="98%" l="local — no cloud" accent={SAGE} />
        </div>
      </main>
    </MacWindow>
  );
}

function Kbd({ children }) {
  return (
    <span className="mono" style={{
      display:'inline-flex', alignItems:'center', padding: '2px 7px',
      background: PAPER_DEEP, border: `1px solid ${RULE}`, borderRadius: 6,
      fontSize: 11, color: INK, fontWeight: 500,
    }}>{children}</span>
  );
}

function Tag({ children, color }) {
  return (
    <span className="mono" style={{
      fontSize: 10, padding: '4px 9px', background: 'transparent',
      border: `1px solid ${RULE}`, color: color || MUTE, borderRadius: 999,
      letterSpacing: '0.05em', textTransform: 'uppercase',
    }}>{children}</span>
  );
}

function Stat({ n, l, accent }) {
  return (
    <div>
      <div className="display" style={{
        fontSize: 38, fontWeight: 600, color: accent || INK,
        fontVariationSettings: `'wdth' 85, 'opsz' 48`, letterSpacing: '-0.02em', lineHeight: 1,
      }}>{n}</div>
      <div style={{ fontSize: 12, color: MUTE, marginTop: 6, letterSpacing: '0.02em' }}>{l}</div>
    </div>
  );
}

function MicGlyph({ size=24, color=INK }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <rect x="9" y="3" width="6" height="11" rx="3" stroke={color} strokeWidth="1.6" />
      <path d="M5 11a7 7 0 0 0 14 0" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 18v3" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

// ============== SETTINGS PAGE ==============
function SettingsArtboard() {
  return (
    <MacWindow width={1100} height={720} title="Freestyle — Settings">
      <Sidebar active="settings" />
      <main style={{
        flex: 1, padding: '48px 64px', display:'flex', flexDirection:'column',
        gap: 32, overflow: 'auto', position:'relative',
      }}>
        <div>
          <div className="mono" style={{ fontSize: 11, letterSpacing: '0.12em', textTransform:'uppercase', color: MUTE, marginBottom: 8 }}>
            Settings
          </div>
          <h1 className="display" style={{
            margin: 0, fontSize: 56, fontWeight: 700, lineHeight: 0.95,
            letterSpacing: '-0.035em', fontVariationSettings: `'wdth' 85, 'opsz' 60`,
          }}>
            Make it yours.
          </h1>
        </div>

        <SettingsRow label="Hotkey" desc="Hold to record, release to transcribe.">
          <div style={{ display:'flex', gap: 8, alignItems:'center' }}>
            <KbdBig>fn</KbdBig>
            <span style={{ fontSize: 12, color: MUTE }}>or</span>
            <KbdBig>⌃</KbdBig><KbdBig>space</KbdBig>
            <button style={chipBtn}>Change</button>
          </div>
        </SettingsRow>

        <SettingsRow label="Transcription" desc="Where audio is turned into text.">
          <Segment options={[
            { id: 'local', label: 'On-device', sub: 'whisper.cpp · base.en' },
            { id: 'cloud', label: 'Cloud', sub: 'OpenAI · BYOK' },
          ]} active="local" />
        </SettingsRow>

        <SettingsRow label="Local model" desc="60 MB, lives in Application Support.">
          <div style={{ display:'flex', alignItems:'center', gap: 14 }}>
            <ProgressBar percent={100} />
            <div style={{ fontSize: 13, color: SAGE, fontWeight: 600 }}>Downloaded</div>
            <button style={ghostBtn}>Re-download</button>
          </div>
        </SettingsRow>

        <SettingsRow label="Polish layer" desc="Optional LLM cleanup — removes 'um', resolves backtracks, fixes punctuation." beta>
          <ToggleSwitch on={true} />
        </SettingsRow>

        <SettingsRow label="OpenAI API key" desc="Stored encrypted in macOS Keychain. Never logged.">
          <div style={{ display:'flex', alignItems:'center', gap: 10 }}>
            <div className="mono" style={{
              fontSize: 13, padding: '8px 12px', background: PAPER_DEEP, border: `1px solid ${RULE}`,
              borderRadius: 8, color: INK_SOFT, letterSpacing: '0.04em',
            }}>sk-…·M3vQ</div>
            <button style={chipBtn}>Replace</button>
            <button style={{ ...ghostBtn, color: CORAL }}>Clear</button>
          </div>
        </SettingsRow>

        <SettingsRow label="Microphone" desc="Pin to internal mic so Bluetooth headphones stay high-quality.">
          <Dropdown value="MacBook Pro Microphone" />
        </SettingsRow>
      </main>
    </MacWindow>
  );
}

function SettingsRow({ label, desc, children, beta }) {
  return (
    <div style={{
      display:'grid', gridTemplateColumns: '280px 1fr', gap: 32,
      paddingBottom: 22, borderBottom: `1px solid ${RULE}`,
      alignItems: 'flex-start',
    }}>
      <div>
        <div style={{ display:'flex', alignItems:'center', gap: 8, marginBottom: 4 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: INK }}>{label}</div>
          {beta && <span className="mono" style={{ fontSize: 9, padding: '2px 6px', background: BUTTER, color: INK, borderRadius: 999, letterSpacing: '0.1em' }}>BETA</span>}
        </div>
        <div style={{ fontSize: 12.5, color: MUTE, lineHeight: 1.5, maxWidth: 260 }}>{desc}</div>
      </div>
      <div>{children}</div>
    </div>
  );
}

function KbdBig({ children }) {
  return (
    <span className="mono" style={{
      display:'inline-flex', alignItems:'center', justifyContent:'center',
      minWidth: 36, height: 32, padding: '0 9px',
      background: '#FFFFFF', border: `1px solid ${RULE}`,
      borderBottom: `2px solid ${RULE}`, borderRadius: 7,
      fontSize: 13, color: INK, fontWeight: 500,
    }}>{children}</span>
  );
}

const chipBtn = {
  background: INK, color: PAPER, border: 'none', padding: '7px 14px',
  borderRadius: 7, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer', fontWeight: 500,
};

const ghostBtn = {
  background: 'transparent', color: INK_SOFT, border: `1px solid ${RULE}`,
  padding: '6px 12px', borderRadius: 7, fontSize: 12.5,
  fontFamily: 'inherit', cursor: 'pointer',
};

function Segment({ options, active }) {
  return (
    <div style={{ display:'inline-flex', background: PAPER_DEEP, padding: 4, borderRadius: 10, border: `1px solid ${RULE}`, gap: 4 }}>
      {options.map(o => {
        const isOn = o.id === active;
        return (
          <div key={o.id} style={{
            background: isOn ? PAPER : 'transparent',
            border: isOn ? `1px solid ${RULE}` : '1px solid transparent',
            padding: '8px 14px', borderRadius: 7,
            display:'flex', flexDirection:'column',
            boxShadow: isOn ? '0 1px 2px rgba(0,0,0,0.04)' : 'none',
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: INK }}>{o.label}</div>
            <div className="mono" style={{ fontSize: 10, color: MUTE, letterSpacing:'0.04em' }}>{o.sub}</div>
          </div>
        );
      })}
    </div>
  );
}

function ProgressBar({ percent }) {
  return (
    <div style={{ width: 160, height: 6, borderRadius: 999, background: PAPER_DEEP, overflow:'hidden' }}>
      <div style={{ width: `${percent}%`, height: '100%', background: SAGE, borderRadius: 999 }} />
    </div>
  );
}

function ToggleSwitch({ on }) {
  return (
    <div style={{
      width: 44, height: 26, borderRadius: 999, background: on ? CORAL : PAPER_DEEP,
      border: `1px solid ${on ? CORAL : RULE}`,
      position: 'relative', transition: 'background 0.18s',
    }}>
      <div style={{
        width: 20, height: 20, borderRadius: '50%', background: '#FFFFFF',
        position: 'absolute', top: 2, left: on ? 21 : 2,
        boxShadow: '0 1px 3px rgba(0,0,0,0.18)', transition: 'left 0.18s',
      }} />
    </div>
  );
}

function Dropdown({ value }) {
  return (
    <div style={{
      display:'inline-flex', alignItems:'center', gap: 12,
      padding: '8px 12px', background: '#FFFFFF', border: `1px solid ${RULE}`,
      borderRadius: 8, fontSize: 13, color: INK, minWidth: 280, justifyContent:'space-between',
    }}>
      <span>{value}</span>
      <svg width="10" height="6" viewBox="0 0 10 6"><path d="M1 1l4 4 4-4" stroke={MUTE} strokeWidth="1.4" fill="none" strokeLinecap="round" /></svg>
    </div>
  );
}

// ============== FLOATING PILL ==============
// Multiple states laid out on a "desktop" backdrop so they're contextual.
function PillArtboard() {
  return (
    <div style={{
      width: 1100, height: 700,
      // tongue-in-cheek "desktop" with subtle striped wallpaper
      background: `linear-gradient(135deg, ${PAPER_DEEP} 0%, #DAD0B7 100%)`,
      padding: 40, boxSizing:'border-box',
      display:'flex', flexDirection:'column', gap: 28, position:'relative', overflow:'hidden',
    }}>
      <Eyebrow text="05 — Floating pill" />

      <div style={{ display:'grid', gridTemplateColumns: '1fr 1fr', gap: 22, flex: 1 }}>
        <PillSlot caption="Idle · hidden until hotkey">
          <PillIdle />
        </PillSlot>
        <PillSlot caption="Listening · live levels" accent>
          <PillRecording />
        </PillSlot>
        <PillSlot caption="Transcribing · whisper running">
          <PillTranscribing />
        </PillSlot>
        <PillSlot caption="Pasted · brief confirm, then fades">
          <PillPasted />
        </PillSlot>
      </div>

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ fontSize: 13, color: INK_SOFT, maxWidth: 520, lineHeight: 1.5 }}>
          Always 48 px tall. Floats above all apps, draggable, anchored to bottom-center by default. The coral fill is the only state-color in the system — when you see it, the mic is open.
        </div>
        <div className="mono" style={{ fontSize: 11, color: MUTE, letterSpacing: '0.08em' }}>
          height 48 · radius 28 · shadow soft
        </div>
      </div>
    </div>
  );
}

function PillSlot({ caption, children, accent }) {
  return (
    <div style={{
      background: '#FFFFFF', borderRadius: 14, border: `1px solid ${RULE}`,
      padding: 24, display:'flex', flexDirection:'column', gap: 18,
      alignItems:'center', justifyContent:'center', minHeight: 0,
    }}>
      <div style={{ flex: 1, display:'flex', alignItems:'center', justifyContent:'center' }}>
        {children}
      </div>
      <div style={{ display:'flex', alignItems:'center', gap: 8 }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: accent ? CORAL : MUTE,
        }} />
        <div className="mono" style={{ fontSize: 11, color: MUTE, letterSpacing: '0.06em' }}>{caption}</div>
      </div>
    </div>
  );
}

function PillBase({ children, bg=INK, color=PAPER, width }) {
  return (
    <div style={{
      height: 48, padding: '0 18px', borderRadius: 28,
      background: bg, color, display:'inline-flex', alignItems:'center', gap: 12,
      boxShadow: '0 10px 28px -8px rgba(0,0,0,0.35), 0 0 0 1px rgba(0,0,0,0.08)',
      minWidth: width,
      fontFamily: 'Inter Tight', fontSize: 14, fontWeight: 500,
    }}>
      {children}
    </div>
  );
}

function PillIdle() {
  return (
    <PillBase>
      <MicGlyph size={18} color={PAPER} />
      <span style={{ opacity: 0.85 }}>Hold</span>
      <span className="mono" style={{
        padding: '2px 7px', background: 'rgba(255,255,255,0.12)', borderRadius: 5,
        fontSize: 11, letterSpacing: '0.05em',
      }}>fn</span>
      <span style={{ opacity: 0.6, marginLeft: 2 }}>to talk</span>
    </PillBase>
  );
}

function PillRecording() {
  return (
    <PillBase bg={CORAL} color={PAPER}>
      <span style={{ position:'relative', display:'inline-flex', alignItems:'center', justifyContent:'center', width: 18, height: 18 }}>
        <span style={{ position:'absolute', inset:0, borderRadius:'50%', background:'rgba(255,255,255,0.35)' }} />
        <span style={{ width: 10, height: 10, borderRadius:'50%', background: PAPER }} />
      </span>
      <VoiceBars count={14} width={130} height={26} color={PAPER} accent={PAPER} animated />
      <span className="mono" style={{ fontSize: 11, opacity: 0.9, letterSpacing:'0.05em' }}>0:04</span>
    </PillBase>
  );
}

function PillTranscribing() {
  return (
    <PillBase>
      <SpinnerDots />
      <span>Transcribing</span>
      <span className="mono" style={{
        padding: '2px 7px', background: 'rgba(255,255,255,0.10)', borderRadius: 5,
        fontSize: 10, letterSpacing: '0.06em', opacity: 0.7, marginLeft: 4,
      }}>WHISPER.BASE</span>
    </PillBase>
  );
}

function SpinnerDots() {
  return (
    <span style={{ display:'inline-flex', gap: 5, alignItems:'center' }}>
      {[0,1,2].map(i => (
        <span key={i} style={{
          width: 6, height: 6, borderRadius:'50%', background: CORAL,
          animation: `pillDot 1.1s ${i*0.15}s infinite ease-in-out`,
        }} />
      ))}
      <style>{`@keyframes pillDot{0%,100%{opacity:0.35;transform:translateY(0)}50%{opacity:1;transform:translateY(-3px)}}`}</style>
    </span>
  );
}

function PillPasted() {
  return (
    <PillBase bg={INK} color={PAPER}>
      <CheckIcon />
      <span>Pasted</span>
      <span style={{ opacity: 0.55, fontSize: 12 }}>· 38 words to Slack</span>
    </PillBase>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="7" stroke={SAGE_SOFT} strokeWidth="1.4" />
      <path d="M5 8l2 2 4-4" stroke={SAGE} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

Object.assign(window, {
  MacWindow, Sidebar,
  HomeArtboard, SettingsArtboard, PillArtboard,
});
