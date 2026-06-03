// Freestyle — Additional screens & states for full coverage.
//
// Covers what wasn't already drawn: empty states, modal overlays, the
// hotkey-recording sub-state, feedback-sent confirmation, the 404, and
// the macOS menu-bar tray dropdown.

// ============================================================
// SETTINGS — hotkey recording sub-state
// ============================================================
// Shows what the Hotkey row looks like while you're capturing a new combo.
function SettingsHotkeyRecording() {
  return (
    <MacWindow title="Freestyle — Settings">
      <SidebarA active="settings" />
      <main style={{ flex: 1, padding: '36px 48px 48px', overflow:'auto', background: R.CANVAS }}>
        <PageHeader title="Settings " subtitle="Press the new key combination — release to capture." />

        <div style={{ display:'flex', flexDirection:'column' }}>
          <Row1 label="Appearance" desc="Choose your preferred theme.">
            <Segment active="light" options={[
              { id: 'light',  label: 'Light',  icon: I.sun },
              { id: 'dark',   label: 'Dark',   icon: I.moon },
              { id: 'system', label: 'System', icon: I.monitor },
            ]} />
          </Row1>
          <Row1 label="Microphone" desc="Select your audio input device.">
            <Dropdown value="MacBook Pro Microphone" icon={I.mic} width={320} />
          </Row1>
          <Row1 label="Hotkey" desc="Hold to record, release to transcribe.">
            <div style={{
              display:'flex', alignItems:'center', gap: 14,
              padding: '10px 14px', borderRadius: 9,
              background: R.OLIVE_SOFT, border: `1.5px solid ${R.OLIVE}`,
              maxWidth: 460,
            }}>
              <span style={{ color: R.OLIVE_DEEP, display:'inline-flex' }}>{I.keyboard({ size: 16 })}</span>
              <Hotkey keys={['⌃','⌥']} />
              <span className="mono" style={{ fontSize: 11, color: R.OLIVE_INK, letterSpacing:'0.06em', opacity: 0.7 }}>
                + press a key…
              </span>
              <span style={{ flex: 1 }} />
              <Btn kind="ghost">Cancel</Btn>
            </div>
          </Row1>
          <Row1 label="Language" desc="Hint for the transcription model.">
            <Dropdown value="Auto-detect" icon={I.languages} width={220} />
          </Row1>
          <Row1 label="Widget position" desc="Where the pill appears on your screen." last>
            <Segment active="bottom-center" compact options={[
              { id: 'bottom-center', label: 'Bottom · Center' },
              { id: 'bottom-right',  label: 'Bottom · Right' },
              { id: 'top-center',    label: 'Top · Center' },
              { id: 'top-right',     label: 'Top · Right' },
            ]} />
          </Row1>
        </div>
      </main>
    </MacWindow>
  );
}

// ============================================================
// MODELS — empty state (no providers yet)
// ============================================================
function ModelsEmpty() {
  return (
    <MacWindow title="Freestyle — Models">
      <SidebarA active="models" />
      <main style={{ flex: 1, padding: '36px 48px 48px', overflow:'auto', background: R.CANVAS }}>
        <PageHeader title="|Models|. " subtitle="Add your first provider to start transcribing. Most people start with Groq — it's the fastest." />

        <div style={{
          background: R.ELEVATED, border: `1.5px dashed ${R.RULE}`, borderRadius: 14,
          padding: '48px 36px', textAlign:'center', maxWidth: 720, marginTop: 16,
        }}>
          <div style={{ display:'inline-flex', alignItems:'center', justifyContent:'center',
            width: 64, height: 64, borderRadius: 16, background: R.OLIVE_SOFT, marginBottom: 18 }}>
            <span style={{ color: R.OLIVE_DEEP, display:'inline-flex' }}>{I.cpu({ size: 28 })}</span>
          </div>
          <h2 className="serif" style={{ margin: 0, fontSize: 32, lineHeight: 1, color: R.INK, fontWeight: 500 }}>
            No models yet.
          </h2>
          <p style={{ margin: '10px auto 24px', fontSize: 14, color: R.MUTE, lineHeight: 1.55, maxWidth: 420 }}>
            Pick a voice model below — you'll paste your API key once, and Freestyle remembers it.
          </p>
          <div style={{ display:'flex', flexDirection:'column', gap: 8, maxWidth: 420, margin: '0 auto' }}>
            <ProviderRow name="Groq · whisper-v3-turbo" desc="Fastest · ~$0.04/hr"   recommended />
            <ProviderRow name="OpenAI · gpt-4o-mini"    desc="Most accurate · ~$0.18/hr" />
            <ProviderRow name="Deepgram · nova-3"       desc="Streaming · ~$0.26/hr" />
          </div>
        </div>
      </main>
    </MacWindow>
  );
}

function ProviderRow({ name, desc, recommended }) {
  return (
    <div style={{
      display:'flex', alignItems:'center', gap: 12,
      padding: '12px 16px', background: R.CANVAS, border: `1px solid ${R.RULE}`,
      borderRadius: 10, textAlign:'left',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display:'flex', alignItems:'center', gap: 8 }}>
          <span style={{ fontSize: 14, color: R.INK, fontWeight: 500 }}>{name}</span>
          {recommended && (
            <span className="mono" style={{
              fontSize: 9, padding: '2px 6px', background: R.OLIVE, color: R.CANVAS,
              borderRadius: 999, letterSpacing: '0.12em',
            }}>RECOMMENDED</span>
          )}
        </div>
        <div style={{ fontSize: 12, color: R.MUTE, marginTop: 2 }}>{desc}</div>
      </div>
      <span style={{ color: R.MUTE, display:'inline-flex' }}>{I.chevR({ size: 14 })}</span>
    </div>
  );
}

// ============================================================
// MODELS — API key modal overlay
// ============================================================
function ModelsKeyModal() {
  return (
    <div style={{ width: '100%', height: '100%', position:'relative' }}>
      {/* Background page (dimmed) */}
      <div style={{ width:'100%', height:'100%', filter:'blur(2px)', opacity: 0.6 }}>
        <ModelsScreen />
      </div>
      {/* Overlay dim */}
      <div style={{
        position:'absolute', inset: 0,
        background: 'rgba(20,12,4,0.35)', backdropFilter:'blur(4px)',
        display:'flex', alignItems:'center', justifyContent:'center',
      }}>
        <div style={{
          width: 440, background: R.ELEVATED, border: `1px solid ${R.RULE}`, borderRadius: 14,
          padding: 28, boxShadow: '0 24px 60px -16px rgba(20,12,4,0.4)',
        }}>
          <div style={{ display:'flex', alignItems:'flex-start', gap: 14, marginBottom: 18 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 10, background: R.OLIVE_SOFT,
              border: `1px solid ${R.OLIVE}33`, flexShrink: 0,
              display:'inline-flex', alignItems:'center', justifyContent:'center',
            }}>
              <span style={{ color: R.OLIVE_DEEP, display:'inline-flex' }}>{I.key({ size: 18 })}</span>
            </div>
            <div style={{ flex: 1 }}>
              <h3 style={{ margin: 0, fontSize: 17, fontWeight: 600, color: R.INK }}>API key required</h3>
              <p style={{ margin: '4px 0 0', fontSize: 13, color: R.MUTE, lineHeight: 1.5 }}>
                To use <span style={{ color: R.INK_SOFT, fontWeight: 500 }}>whisper-large-v3-turbo</span>, paste your <span style={{ color: R.INK_SOFT, fontWeight: 500 }}>Groq</span> API key.
              </p>
            </div>
          </div>
          <div style={{
            position:'relative',
            padding: '10px 12px 10px 36px', background: R.CANVAS,
            border: `1px solid ${R.RULE}`, borderRadius: 8,
            fontFamily: 'JetBrains Mono', fontSize: 13, color: R.INK, letterSpacing:'0.04em',
          }}>
            <span style={{
              position:'absolute', left: 12, top: '50%', transform:'translateY(-50%)',
              color: R.MUTE, display:'inline-flex',
            }}>{I.key({ size: 14 })}</span>
            gsk_••••••••••••••••••••
          </div>
          <p className="mono" style={{ margin: '10px 0 0', fontSize: 10.5, color: R.MUTE, letterSpacing: '0.06em' }}>
            STORED IN KEYCHAIN · NEVER LOGGED
          </p>
          <div style={{ marginTop: 22, display:'flex', justifyContent:'flex-end', gap: 10 }}>
            <Btn kind="ghost">Cancel</Btn>
            <Btn kind="primary">Save & continue</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// DICTIONARY — empty state
// ============================================================
function DictionaryEmpty() {
  return (
    <MacWindow title="Freestyle — Dictionary">
      <SidebarA active="dictionary" />
      <main style={{ flex: 1, padding: '36px 48px 48px', overflow:'auto', background: R.CANVAS }}>
        <PageHeader title="|Dictionary|. " subtitle="Define shortcuts that expand as you speak. Say the key, get the value." />

        <div style={{
          background: R.ELEVATED, border: `1.5px dashed ${R.RULE}`, borderRadius: 14,
          padding: '52px 36px', textAlign:'center', marginTop: 16,
        }}>
          <div style={{ display:'inline-flex', alignItems:'center', justifyContent:'center',
            width: 64, height: 64, borderRadius: 16, background: R.OLIVE_SOFT, marginBottom: 18 }}>
            <span style={{ color: R.OLIVE_DEEP, display:'inline-flex' }}>{I.book({ size: 28 })}</span>
          </div>
          <h2 className="serif" style={{ margin: 0, fontSize: 32, lineHeight: 1, color: R.INK, fontWeight: 500 }}>
            Nothing in the book yet.
          </h2>
          <p style={{ margin: '10px auto 22px', fontSize: 14, color: R.MUTE, lineHeight: 1.55, maxWidth: 440 }}>
            Add a phrase you say often, like <span className="mono" style={{
              fontSize: 12, padding: '2px 7px', background: R.CANVAS, border: `1px solid ${R.RULE}`, borderRadius: 5,
            }}>my address</span> — and Freestyle expands it inline.
          </p>
          <Btn kind="primary" icon={I.plus}>Add your first entry</Btn>
        </div>
      </main>
    </MacWindow>
  );
}

// ============================================================
// HISTORY — empty state
// ============================================================
function HistoryEmpty() {
  return (
    <MacWindow title="Freestyle — History">
      <SidebarA active="history" />
      <main style={{ flex: 1, padding: '36px 48px 48px', overflow:'auto', background: R.CANVAS }}>
        <PageHeader title="|History|. " subtitle="Every session you've dictated will live here." />

        <div style={{
          background: R.ELEVATED, border: `1.5px dashed ${R.RULE}`, borderRadius: 14,
          padding: '60px 36px', textAlign:'center', marginTop: 16,
        }}>
          <div style={{ display:'inline-flex', alignItems:'center', justifyContent:'center',
            width: 64, height: 64, borderRadius: 16, background: R.OLIVE_SOFT, marginBottom: 18 }}>
            <span style={{ color: R.OLIVE_DEEP, display:'inline-flex' }}>{I.clock({ size: 28 })}</span>
          </div>
          <h2 className="serif" style={{ margin: 0, fontSize: 32, lineHeight: 1, color: R.INK, fontWeight: 500 }}>
            Nothing recorded yet.
          </h2>
          <p style={{ margin: '10px auto 22px', fontSize: 14, color: R.MUTE, lineHeight: 1.55, maxWidth: 440 }}>
            Hold <Kbd>⌥</Kbd> <Kbd>Space</Kbd> anywhere on your Mac, speak, release.
            Your first transcript will appear here.
          </p>
        </div>
      </main>
    </MacWindow>
  );
}

// ============================================================
// FEEDBACK — sent confirmation
// ============================================================
function FeedbackSent() {
  return (
    <MacWindow title="Freestyle — Feedback">
      <SidebarA active="feedback" />
      <main style={{ flex: 1, padding: '36px 48px 48px', overflow:'auto', background: R.CANVAS }}>
        <div style={{
          flex: 1, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
          padding: '80px 24px', textAlign:'center',
        }}>
          <div style={{ display:'inline-flex', alignItems:'center', justifyContent:'center',
            width: 72, height: 72, borderRadius: 18, background: R.OLIVE_SOFT, marginBottom: 26 }}>
            <span style={{ color: R.OLIVE_DEEP, display:'inline-flex' }}>{I.check({ size: 32, strokeWidth: 2.2 })}</span>
          </div>
          <h1 style={{ margin: 0 }}>
            <span className="serif" style={{ fontSize: 56, color: R.INK, lineHeight: 0.95, letterSpacing:'-0.025em', fontWeight: 400 }}>Thanks for </span>
            <span className="serif-italic" style={{ fontSize: 56, color: R.OLIVE, lineHeight: 0.95 }}>writing in.</span>
          </h1>
          <p style={{ margin: '16px auto 26px', fontSize: 16, color: R.INK_SOFT, lineHeight: 1.5, maxWidth: 480 }}>
            We read everything. If you left an email, we'll usually reply within a day or two.
          </p>
          <Btn kind="ghost">Send another</Btn>
        </div>
      </main>
    </MacWindow>
  );
}

// ============================================================
// NOT FOUND — minimal editorial 404
// ============================================================
function NotFoundScreen() {
  return (
    <MacWindow title="Freestyle">
      <div style={{ flex: 1, background: R.CANVAS, display:'flex', alignItems:'center', justifyContent:'center', padding: 64 }}>
        <div style={{ textAlign:'center', maxWidth: 560 }}>
          <div className="mono" style={{ fontSize: 11, letterSpacing:'0.2em', textTransform:'uppercase', color: R.MUTE, marginBottom: 24 }}>
            404 · Page not found
          </div>
          <h1 style={{ margin: 0 }}>
            <span className="serif" style={{ fontSize: 92, color: R.INK, lineHeight: 0.9, letterSpacing:'-0.03em', fontWeight: 400 }}>Nothing </span>
            <span className="serif-italic" style={{ fontSize: 92, color: R.OLIVE, lineHeight: 0.9 }}>here.</span>
          </h1>
          <p style={{ margin: '20px auto 28px', fontSize: 17, color: R.INK_SOFT, lineHeight: 1.5, maxWidth: 420 }}>
            That page doesn't exist — or it moved. Head back to your day and keep talking.
          </p>
          <Btn kind="primary">← Back to today</Btn>
        </div>
      </div>
    </MacWindow>
  );
}

// ============================================================
// TRAY MENU — macOS menu bar dropdown
// ============================================================
function TrayMenuArtboard() {
  return (
    <div style={{
      width: '100%', height: '100%',
      background: `linear-gradient(135deg, #8A7965, #4A3E2E)`,
      padding: 48, boxSizing: 'border-box', position:'relative', overflow:'hidden',
    }}>
      {/* fake menu bar at the top */}
      <div style={{
        position:'absolute', top: 0, left: 0, right: 0, height: 28,
        background: 'rgba(255,255,255,0.18)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.1)',
        display:'flex', alignItems:'center', gap: 18, padding: '0 14px',
      }}>
        <span style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}></span>
        <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12.5, fontWeight: 500 }}>Cursor</span>
        <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12.5 }}>File</span>
        <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12.5 }}>Edit</span>
        <span style={{ flex: 1 }} />
        <Wave size={14} color="#fff" />
        <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 12.5, fontWeight: 500 }}>READY</span>
        <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12.5 }}>100%</span>
        <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12.5 }}>Thu 11:42 PM</span>
      </div>

      {/* The dropdown menu */}
      <div style={{
        position:'absolute', top: 36, right: 80,
        width: 280, background: 'rgba(255,255,255,0.78)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(20,12,4,0.1)', borderRadius: 10,
        padding: 6, boxShadow: '0 20px 50px -8px rgba(0,0,0,0.4)',
      }}>
        {/* Status header */}
        <div style={{
          padding: '12px 14px 10px', borderBottom: `1px solid ${R.RULE_SOFT}`,
          display:'flex', alignItems:'center', gap: 10,
        }}>
          <Wave size={20} color={R.OLIVE} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: R.INK }}>Freestyle</div>
            <div className="mono" style={{ fontSize: 10, color: R.OLIVE_DEEP, letterSpacing:'0.12em' }}>
              READY · whisper-v3-turbo
            </div>
          </div>
        </div>

        {/* Menu items */}
        <div style={{ padding: 4 }}>
          <TrayItem label="Today's transcripts" shortcut="⌘ T" />
          <TrayItem label="Start recording…"    shortcut="⌥ Space" highlight />
          <TraySeparator />
          <TrayItem label="Settings…"     shortcut="⌘ ," />
          <TrayItem label="History"       shortcut="⌘ 5" />
          <TrayItem label="Dictionary"    shortcut="⌘ 3" />
          <TraySeparator />
          <TrayItem label="About Freestyle" />
          <TrayItem label="Check for updates…" />
          <TraySeparator />
          <TrayItem label="Quit Freestyle"  shortcut="⌘ Q" />
        </div>
      </div>

      {/* Caption */}
      <div style={{
        position:'absolute', bottom: 30, left: 36, right: 36,
        fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1.5,
      }}>
        Click the wave in the menu bar — recording status, quick actions, settings — same shortcuts as the global hotkeys.
      </div>
    </div>
  );
}

function TrayItem({ label, shortcut, highlight }) {
  return (
    <div style={{
      display:'flex', alignItems:'center', gap: 10,
      padding: '6px 10px', borderRadius: 6,
      background: highlight ? R.OLIVE_SOFT : 'transparent',
      cursor: 'default',
    }}>
      <span style={{
        fontSize: 13, color: highlight ? R.OLIVE_INK : R.INK,
        fontWeight: highlight ? 500 : 400, flex: 1,
      }}>{label}</span>
      {shortcut && (
        <span className="mono" style={{
          fontSize: 10.5, color: R.MUTE, letterSpacing: '0.04em',
        }}>{shortcut}</span>
      )}
    </div>
  );
}

function TraySeparator() {
  return <div style={{ height: 1, background: R.RULE_SOFT, margin: '4px 6px' }} />;
}

// ============================================================
// COVER ARTBOARD — overview / table of contents
// ============================================================
function CoverArtboard() {
  return (
    <div style={{
      width: '100%', height: '100%', background: R.CANVAS,
      padding: 64, boxSizing: 'border-box', display:'flex', flexDirection:'column',
      position:'relative', overflow: 'hidden',
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <Eyebrow text="Full app coverage" />
        <span className="mono" style={{ fontSize: 11, letterSpacing:'0.18em', textTransform:'uppercase', color: R.MUTE }}>
          v0.4 · alpha · all screens
        </span>
      </div>

      <h1 style={{ margin: '36px 0 22px' }}>
        <span className="serif" style={{ fontSize: 110, color: R.INK, lineHeight: 0.9, letterSpacing:'-0.03em', fontWeight: 400 }}>Every screen, </span>
        <span className="serif-italic" style={{ fontSize: 110, color: R.OLIVE, lineHeight: 0.9 }}>in order.</span>
      </h1>

      <p style={{ margin: '0 0 36px', fontSize: 17, color: R.INK_SOFT, lineHeight: 1.55, maxWidth: 720, textWrap:'pretty' }}>
        Twenty-four artboards covering everything in the current Freestyle codebase plus the new Today home, every empty state, and a tray menu mock for the menu bar.
      </p>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap: 14, flex: 1 }}>
        {[
          { num:'01', title:'Floating pill', count:'6 states', desc:'Idle, recording, streaming, transcribing, pasted, error.' },
          { num:'02', title:'Onboarding',    count:'3 steps',  desc:'Welcome → permissions → voice model.' },
          { num:'03', title:'Today',         count:'1 view',   desc:'Timeline of the day with stats rail.' },
          { num:'04', title:'Settings',      count:'2 states', desc:'Main view + hotkey-recording capture.' },
          { num:'05', title:'Models',        count:'3 states', desc:'Configured, empty, API-key modal.' },
          { num:'06', title:'Dictionary',    count:'2 states', desc:'List view + empty state.' },
          { num:'07', title:'Formats',       count:'1 view',   desc:'Custom + default rule cards.' },
          { num:'08', title:'History',       count:'2 states', desc:'Sessions feed + empty state.' },
          { num:'09', title:'Feedback',      count:'2 states', desc:'Form + sent confirmation.' },
          { num:'10', title:'Tray menu',     count:'1 view',   desc:'Menu-bar dropdown.' },
          { num:'11', title:'Not found',     count:'1 view',   desc:'Editorial 404.' },
          { num:'—',  title:'Explorations',  count:'archive',  desc:'Earlier pill / settings / home variants.' },
        ].map(c => (
          <div key={c.num} style={{
            background: R.ELEVATED, border: `1px solid ${R.RULE}`, borderRadius: 12,
            padding: '14px 16px', display:'flex', flexDirection:'column', gap: 6,
          }}>
            <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between' }}>
              <span className="mono" style={{ fontSize: 10.5, color: R.OLIVE, letterSpacing:'0.18em' }}>{c.num}</span>
              <span className="mono" style={{ fontSize: 9.5, color: R.MUTE, letterSpacing:'0.06em' }}>{c.count}</span>
            </div>
            <div style={{ fontSize: 15, color: R.INK, fontWeight: 500 }}>{c.title}</div>
            <p style={{ margin: 0, fontSize: 12, color: R.MUTE, lineHeight: 1.45 }}>{c.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, {
  SettingsHotkeyRecording,
  ModelsEmpty, ModelsKeyModal,
  DictionaryEmpty, HistoryEmpty,
  FeedbackSent, NotFoundScreen,
  TrayMenuArtboard, CoverArtboard,
});
