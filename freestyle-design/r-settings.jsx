// Freestyle — Settings pages.
//
// SETTINGS LAYOUT PATTERNS — explored via the General page in 3 variants:
//   P1 · Vertical rows (refined current pattern)
//   P2 · Bento grid (different tile widths)
//   P3 · Two-column (label left, control right — System-Settings style)
//
// Then the actual screen builds:
//   Models     — refined card layout (provider cards instead of plain rows)
//   History    — editorial push (stats + grouped feed in italic serif)

// ============================================================
// GENERAL — PATTERN 1 · VERTICAL ROWS (refined current)
// ============================================================
function GeneralP1() {
  return (
    <MacWindow title="Freestyle — Settings">
      <SidebarA active="settings" />
      <main style={{ flex: 1, padding: '36px 48px 48px', overflow:'auto', background: R.CANVAS }}>
        <PageHeader title="Settings " subtitle="Configure how Freestyle behaves on your machine." />

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
            <div style={{ display:'flex', alignItems:'center', gap: 12 }}>
              <Hotkey keys={['⌥', 'Space']} />
              <Btn kind="ghost">Change</Btn>
            </div>
          </Row1>
          <Row1 label="Language" desc="Hint for the transcription model.">
            <Dropdown value="Auto-detect" icon={I.languages} width={220} />
          </Row1>
          <Row1 label="Widget position" desc="Where the pill appears on your screen.">
            <Segment active="bottom-center" compact options={[
              { id: 'bottom-center', label: 'Bottom · Center' },
              { id: 'bottom-right',  label: 'Bottom · Right' },
              { id: 'top-center',    label: 'Top · Center' },
              { id: 'top-right',     label: 'Top · Right' },
            ]} />
          </Row1>
          <Row1 label="Sounds" desc="Soft chimes at start and end of recording." last>
            <Toggle on={true} big />
          </Row1>
        </div>
      </main>
    </MacWindow>
  );
}

function Row1({ label, desc, children, last = false }) {
  return (
    <div style={{
      display:'grid', gridTemplateColumns: '280px 1fr', gap: 36,
      padding: '22px 0', borderBottom: last ? 'none' : `1px solid ${R.RULE}`,
      alignItems: 'flex-start',
    }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 500, color: R.INK }}>{label}</div>
        <div style={{ fontSize: 12.5, color: R.MUTE, lineHeight: 1.5, marginTop: 2, maxWidth: 260 }}>{desc}</div>
      </div>
      <div>{children}</div>
    </div>
  );
}

// ============================================================
// GENERAL — PATTERN 2 · BENTO GRID
// ============================================================
function GeneralP2() {
  return (
    <MacWindow title="Freestyle — Settings">
      <SidebarA active="settings" />
      <main style={{ flex: 1, padding: '36px 40px 40px', overflow:'auto', background: R.CANVAS }}>
        <PageHeader title="Settings " subtitle="A bento — tile sizes match the weight of each control." />

        <div style={{ display:'grid', gridTemplateColumns:'repeat(6, 1fr)', gap: 12 }}>
          <Bento span={3} label="Appearance" desc="Theme follows your preference.">
            <Segment active="light" options={[
              { id: 'light',  label: 'Light',  icon: I.sun },
              { id: 'dark',   label: 'Dark',   icon: I.moon },
              { id: 'system', label: 'System', icon: I.monitor },
            ]} />
          </Bento>
          <Bento span={3} label="Hotkey" desc="Hold to record, release to transcribe.">
            <div style={{ display:'flex', alignItems:'center', gap: 12 }}>
              <Hotkey keys={['⌥','Space']} />
              <Btn kind="ghost">Change</Btn>
            </div>
          </Bento>
          <Bento span={4} label="Microphone" desc="Pick the input device used for transcription.">
            <Dropdown value="MacBook Pro Microphone" icon={I.mic} width="100%" />
          </Bento>
          <Bento span={2} label="Language" desc="Hint for the model.">
            <Dropdown value="Auto-detect" icon={I.languages} width="100%" />
          </Bento>
          <Bento span={4} label="Widget position" desc="Where the floating pill appears.">
            <Segment compact active="bottom-center" options={[
              { id: 'bottom-center', label: 'Bottom · Center' },
              { id: 'bottom-right',  label: 'Bottom · Right' },
              { id: 'top-center',    label: 'Top · Center' },
              { id: 'top-right',     label: 'Top · Right' },
            ]} />
          </Bento>
          <Bento span={2} label="Sounds" desc="Soft chimes start/end.">
            <Toggle on={true} big />
          </Bento>
        </div>
      </main>
    </MacWindow>
  );
}

function Bento({ children, label, desc, span = 2 }) {
  return (
    <div style={{
      gridColumn: `span ${span}`, background: R.ELEVATED,
      border: `1px solid ${R.RULE}`, borderRadius: 12, padding: '16px 18px',
      display:'flex', flexDirection:'column', gap: 14, minHeight: 124,
    }}>
      <div>
        <div style={{ fontSize: 13.5, color: R.INK, fontWeight: 500 }}>{label}</div>
        <div style={{ fontSize: 11.5, color: R.MUTE, lineHeight: 1.45, marginTop: 2 }}>{desc}</div>
      </div>
      <div style={{ marginTop: 'auto' }}>{children}</div>
    </div>
  );
}

// ============================================================
// GENERAL — PATTERN 3 · TWO-COLUMN (label LEFT, control RIGHT, tight)
// ============================================================
function GeneralP3() {
  return (
    <MacWindow title="Freestyle — Settings">
      <SidebarB active="settings" />
      <main style={{ flex: 1, padding: '40px 56px 48px', overflow:'auto', background: R.CANVAS }}>
        <PageHeader title="Settings " subtitle="Edit one thing at a time. Each setting saves the moment you change it." />

        <div style={{
          background: R.ELEVATED, border: `1px solid ${R.RULE}`, borderRadius: 12,
          padding: '6px 24px',
        }}>
          <Row3 label="Theme">
            <Segment active="light" options={[
              { id: 'light',  label: 'Light',  icon: I.sun },
              { id: 'dark',   label: 'Dark',   icon: I.moon },
              { id: 'system', label: 'System', icon: I.monitor },
            ]} />
          </Row3>
          <Row3 label="Microphone">
            <Dropdown value="MacBook Pro Microphone" icon={I.mic} width={300} />
          </Row3>
          <Row3 label="Hotkey">
            <div style={{ display:'flex', alignItems:'center', gap: 10 }}>
              <Hotkey keys={['⌥','Space']} />
            </div>
          </Row3>
          <Row3 label="Language">
            <Dropdown value="Auto-detect" width={220} />
          </Row3>
          <Row3 label="Widget position">
            <Segment compact active="bottom-center" options={[
              { id: 'bottom-center', label: 'Bottom' },
              { id: 'bottom-right',  label: 'B · R' },
              { id: 'top-center',    label: 'Top' },
              { id: 'top-right',     label: 'T · R' },
            ]} />
          </Row3>
          <Row3 label="Start sound">
            <Toggle on={true} />
          </Row3>
          <Row3 label="End sound" last>
            <Toggle on={false} />
          </Row3>
        </div>
      </main>
    </MacWindow>
  );
}

function Row3({ label, children, last = false }) {
  return (
    <div style={{
      display:'grid', gridTemplateColumns: '180px 1fr', gap: 24,
      padding: '14px 0', alignItems:'center',
      borderBottom: last ? 'none' : `1px solid ${R.RULE_SOFT}`,
    }}>
      <div style={{ fontSize: 13.5, color: R.INK_SOFT, fontWeight: 500 }}>{label}</div>
      <div>{children}</div>
    </div>
  );
}

// ============================================================
// MODELS — provider-card layout (refined)
// ============================================================
function ModelsScreen() {
  const providers = [
    { id: 'openai',   name: 'OpenAI',    type:'voice+llm', voiceModel: 'gpt-4o-mini-transcribe', llmModel: 'gpt-4o-mini', active: 'voice' },
    { id: 'groq',     name: 'Groq',      type:'voice', voiceModel: 'whisper-large-v3-turbo', active: null },
    { id: 'anthropic',name: 'Anthropic', type:'llm',   llmModel: 'claude-haiku-4-5', active: null },
    { id: 'deepgram', name: 'Deepgram',  type:'voice', voiceModel: 'nova-3', active: null, noKey: true },
  ];
  return (
    <MacWindow title="Freestyle — Models">
      <SidebarA active="models" />
      <main style={{ flex: 1, padding: '36px 48px 48px', overflow:'auto', background: R.CANVAS }}>
        <PageHeader title="|Models|. " subtitle="Configure voice and language models for transcription. Mix providers — use Groq for speed and Anthropic for cleanup." />

        {/* Big "current pair" card */}
        <div style={{
          background: R.ELEVATED, border: `1px solid ${R.RULE}`, borderRadius: 14,
          padding: 22, marginBottom: 28, display:'grid', gridTemplateColumns:'1fr 1fr', gap: 22,
        }}>
          <Pair
            kicker="Voice · required"
            name="gpt-4o-mini-transcribe"
            provider="OpenAI"
            cta="Change"
            primary
          />
          <div style={{ borderLeft: `1px solid ${R.RULE}`, paddingLeft: 22 }}>
            <Pair
              kicker="LLM cleanup · optional"
              name="gpt-4o-mini"
              provider="OpenAI"
              cta="Change"
              toggle
            />
          </div>
        </div>

        {/* Providers list */}
        <div style={{ marginBottom: 14, display:'flex', alignItems:'baseline', justifyContent:'space-between' }}>
          <div>
            <h2 className="serif-italic" style={{ fontSize: 26, margin: 0, color: R.INK, lineHeight: 1 }}>Providers</h2>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: R.MUTE }}>Manage API keys. Keys are stored in your system keychain.</p>
          </div>
          <Btn kind="ghost" icon={I.plus}>Add provider</Btn>
        </div>

        <div style={{ display:'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          {providers.map(p => <ProviderCard key={p.id} provider={p} />)}
        </div>
      </main>
    </MacWindow>
  );
}

function Pair({ kicker, name, provider, cta, primary, toggle }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap: 12 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
        <Eyebrow text={kicker} accent={primary ? R.OLIVE : R.MUTE} />
        {toggle && <Toggle on={true} />}
      </div>
      <div>
        <div className="serif" style={{ fontSize: 36, color: R.INK, lineHeight: 1, letterSpacing:'-0.02em', fontWeight: 400 }}>
          {name}
        </div>
        <div style={{ fontSize: 13, color: R.MUTE, marginTop: 6 }}>
          via <span style={{ color: R.INK_SOFT, fontWeight: 500 }}>{provider}</span>
        </div>
      </div>
      <div style={{ marginTop: 'auto', display:'flex', alignItems:'center', gap: 10 }}>
        <Btn kind={primary ? 'primary' : 'ghost'}>{cta}</Btn>
        {primary && (
          <span className="mono" style={{ fontSize: 10.5, color: R.OLIVE, letterSpacing:'0.14em' }}>READY</span>
        )}
      </div>
    </div>
  );
}

function ProviderCard({ provider }) {
  return (
    <div style={{
      background: R.ELEVATED, border: `1px solid ${R.RULE}`, borderRadius: 11,
      padding: '14px 16px', display:'flex', alignItems:'center', gap: 14,
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 8,
        background: provider.noKey ? 'transparent' : R.OLIVE_SOFT,
        border: provider.noKey ? `1px dashed ${R.RULE}` : `1px solid ${R.OLIVE_DEEP}33`,
        display:'flex', alignItems:'center', justifyContent:'center', flexShrink: 0,
      }}>
        <span style={{ color: provider.noKey ? R.MUTE : R.OLIVE_DEEP, display:'inline-flex' }}>{I.key({ size: 14 })}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display:'flex', alignItems:'center', gap: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: R.INK }}>{provider.name}</span>
          {provider.active === 'voice' && (
            <span className="mono" style={{
              fontSize: 9, padding: '2px 6px', background: R.OLIVE, color: R.CANVAS,
              borderRadius: 999, letterSpacing: '0.12em',
            }}>ACTIVE</span>
          )}
          {provider.noKey && (
            <span className="mono" style={{
              fontSize: 9, padding: '2px 6px', background: 'transparent', color: R.BLUSH,
              border: `1px solid ${R.BLUSH}33`, borderRadius: 999, letterSpacing: '0.12em',
            }}>NO KEY</span>
          )}
        </div>
        <div style={{ fontSize: 12, color: R.MUTE, marginTop: 2 }}>
          {provider.voiceModel && <span>{provider.voiceModel}</span>}
          {provider.voiceModel && provider.llmModel && <span> · </span>}
          {provider.llmModel && <span>{provider.llmModel}</span>}
          {!provider.voiceModel && !provider.llmModel && <span>No models configured</span>}
        </div>
      </div>
      <span style={{ color: R.MUTE, display:'inline-flex' }}>{I.chevR({ size: 14 })}</span>
    </div>
  );
}

// ============================================================
// HISTORY — editorial push
// ============================================================
function HistoryScreen() {
  return (
    <MacWindow title="Freestyle — History">
      <SidebarA active="history" />
      <main style={{ flex: 1, padding: '36px 48px 48px', overflow:'auto', background: R.CANVAS }}>
        <PageHeader title="|History|. " subtitle="Every session you've dictated. Search the contents, copy what you need, see how fast you're getting." />

        {/* Stats */}
        <div style={{
          display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap: 10, marginBottom: 28,
          paddingBottom: 28, borderBottom: `1px solid ${R.RULE}`,
        }}>
          <Stat n="1,284" l="words today" />
          <Stat n="38" l="sessions" />
          <Stat n="4.2×" l="faster than typing" />
          <Stat n="$0.12" l="cost this month" accent />
        </div>

        {/* Search row */}
        <div style={{ display:'flex', alignItems:'center', gap: 10, marginBottom: 24 }}>
          <div style={{
            flex: 1, position:'relative',
            display:'flex', alignItems:'center', gap: 8,
            padding: '8px 12px', background: R.ELEVATED, border: `1px solid ${R.RULE}`,
            borderRadius: 8, fontSize: 13,
          }}>
            <span style={{ color: R.MUTE, display:'inline-flex' }}>{I.search({ size: 14 })}</span>
            <span style={{ color: R.MUTE, flex: 1 }}>Search 287 transcripts…</span>
            <span className="mono" style={{ fontSize: 10, color: R.MUTE }}>⌘ K</span>
          </div>
          <Btn kind="ghost">Clear all</Btn>
        </div>

        {/* Feed */}
        <FeedGroup label="Today">
          <FeedItem
            time="11:42 pm" app="Slack" duration="14s" model="whisper · gpt-4o-mini" cost="$0.001"
            featured
            quote="Could you push the meeting from two to three? Actually, let's make it tomorrow at ten — easier on everyone."
          />
          <FeedItem
            time="10:14 pm" app="Notes" duration="6s" model="whisper" cost="$0.000"
            quote="Reminder: grab the dry cleaning before seven — Tuesday night, not Wednesday."
          />
          <FeedItem
            time="9:30 pm" app="Linear" duration="22s" model="whisper · gpt-4o-mini" cost="$0.002"
            quote="Bug: the pill shows 'paste' even when the clipboard write failed. Repro: deny accessibility permission, hold hotkey, release. We should surface the actual error instead of a false success."
          />
        </FeedGroup>

        <FeedGroup label="Yesterday">
          <FeedItem
            time="6:21 pm" app="iMessage" duration="4s" model="whisper" cost="$0.000"
            quote="Running ten minutes late, sorry — order me whatever."
          />
          <FeedItem
            time="3:08 pm" app="Gmail" duration="38s" model="nova-3 · claude" cost="$0.003"
            quote="Hi Maria, thanks for the update on the renderer migration. I'd like to dig into the performance numbers a bit more before we commit to shipping next sprint — particularly the cold-start regression on Windows. Could we set up time on Thursday?"
          />
        </FeedGroup>
      </main>
    </MacWindow>
  );
}

function Stat({ n, l, accent }) {
  return (
    <div style={{
      background: R.ELEVATED, border: `1px solid ${R.RULE}`, borderRadius: 11,
      padding: '16px 18px',
    }}>
      <div className="serif-italic" style={{
        fontSize: 38, lineHeight: 1, color: accent ? R.OLIVE : R.INK,
      }}>{n}</div>
      <div className="mono" style={{
        fontSize: 10, marginTop: 8, color: R.MUTE, letterSpacing: '0.14em', textTransform:'uppercase',
      }}>{l}</div>
    </div>
  );
}

function FeedGroup({ label, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{
        display:'flex', alignItems:'center', gap: 12, marginBottom: 12,
      }}>
        <div className="mono" style={{
          fontSize: 10, color: R.MUTE, letterSpacing: '0.18em', textTransform:'uppercase',
        }}>{label}</div>
        <div style={{ flex: 1, height: 1, background: R.RULE }} />
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap: 0 }}>
        {children}
      </div>
    </div>
  );
}

function FeedItem({ time, app, duration, model, cost, quote, featured }) {
  return (
    <div style={{
      background: featured ? R.ELEVATED : 'transparent',
      border: featured ? `1px solid ${R.RULE}` : '1px solid transparent',
      borderBottom: featured ? `1px solid ${R.RULE}` : `1px solid ${R.RULE_SOFT}`,
      borderRadius: featured ? 12 : 0,
      padding: featured ? '18px 22px' : '14px 6px',
      marginBottom: featured ? 8 : 0,
    }}>
      <div style={{ display:'flex', alignItems:'center', gap: 10, marginBottom: 8 }}>
        <span className="mono" style={{ fontSize: 11, color: R.INK, fontWeight: 500, letterSpacing:'0.04em' }}>{time}</span>
        <span style={{ width: 3, height: 3, borderRadius:'50%', background: R.MUTE }} />
        <span className="mono" style={{ fontSize: 10.5, color: R.OLIVE, fontWeight: 600, letterSpacing:'0.12em', textTransform:'uppercase' }}>{app}</span>
        <span style={{ flex: 1 }} />
        <span className="mono" style={{ fontSize: 10, color: R.MUTE, letterSpacing:'0.06em' }}>{duration} · {model}</span>
        {cost && <span className="mono" style={{ fontSize: 10, color: R.MUTE }}>· {cost}</span>}
      </div>
      <p className="serif" style={{
        margin: 0, fontSize: featured ? 22 : 18, color: R.INK, lineHeight: 1.5,
        textWrap: 'pretty', fontWeight: 450,
      }}>
        “{quote}”
      </p>
    </div>
  );
}

Object.assign(window, {
  GeneralP1, GeneralP2, GeneralP3,
  ModelsScreen, HistoryScreen,
});
