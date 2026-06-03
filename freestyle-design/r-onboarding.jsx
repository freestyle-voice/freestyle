// Freestyle — Onboarding (editorial push). Three steps on a single shell —
// Permissions, Model (on-device, opinionated), How to use.

// Step pill at the top of the window
function StepPill({ index, total, label, current }) {
  const isCurrent = index === current;
  const isPast = index < current;
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span style={{
        width: 22, height: 22, borderRadius: '50%',
        background: isPast ? R.OLIVE : isCurrent ? R.OLIVE : R.PAPER,
        border: isPast ? 'none' : isCurrent ? `1px solid ${R.OLIVE_DEEP}` : `1px solid ${R.RULE}`,
        color: isPast || isCurrent ? R.CANVAS : R.MUTE,
        fontSize: 10, fontWeight: 600,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'JetBrains Mono'
      }}>
        {isPast ? <span style={{ display: 'inline-flex' }}>{I.check({ size: 12, strokeWidth: 2.4 })}</span> : index + 1}
      </span>
      <span className="mono" style={{
        fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase',
        color: isCurrent ? R.INK : R.MUTE, fontWeight: isCurrent ? 500 : 400
      }}>{label}</span>
    </div>);

}

function StepsHeader({ current, hidden }) {
  if (hidden) return null;
  const steps = ['Permissions', 'Model', 'How to use'];
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18,
      padding: '24px 0', borderBottom: `1px solid ${R.RULE_SOFT}`,
      flexShrink: 0
    }}>
      {steps.map((label, i) =>
      <React.Fragment key={label}>
          <StepPill index={i} total={steps.length} label={label} current={current} />
          {i < steps.length - 1 &&
        <span style={{ width: 32, height: 1, background: i < current ? R.OLIVE : R.RULE }} />
        }
        </React.Fragment>
      )}
    </div>);

}

// Reusable keycap
function Keycap({ children, held, wide }) {
  return (
    <span className="mono" style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      minWidth: wide ? 64 : 38, height: 38, padding: '0 12px',
      borderRadius: 8, fontSize: 13, fontWeight: 600,
      background: held ? R.OLIVE : R.ELEVATED,
      color: held ? R.CANVAS : R.INK,
      border: `1px solid ${held ? R.OLIVE_DEEP : R.RULE}`,
      boxShadow: held ? 'none' : `0 2px 0 ${R.RULE}`
    }}>{children}</span>);

}

// Little equalizer / waveform visual
function Waveform({ color = R.OLIVE, bars = 11 }) {
  const heights = [9, 16, 24, 13, 28, 20, 32, 18, 25, 12, 8];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, height: 34 }}>
      {heights.slice(0, bars).map((h, i) =>
      <span key={i} style={{ width: 3, height: h, borderRadius: 2, background: color, opacity: 0.55 + h / 64 }} />
      )}
    </span>);

}

// ============================================================
// STEP 1 — PERMISSIONS (minimalist)
// ============================================================
function OnboardingPermissions() {
  const [micOk, setMicOk] = React.useState(true);
  const [a11yOk, setA11yOk] = React.useState(false);
  const allGranted = micOk && a11yOk;
  return (
    <MacWindow width={1100} height={780} title="Freestyle">
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: R.CANVAS }}>
        <StepsHeader current={0} hidden />
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '40px 80px'
        }}>
          <div style={{ width: '100%', maxWidth: 440 }}>
            <div className="mono" style={{
              textAlign: 'center', fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase',
              color: R.MUTE, marginBottom: 22
            }}>Freestyle needs</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <PermCard
                icon={I.mic}
                title="Microphone"
                desc="To hear what you say."
                granted={micOk}
                onGrant={() => setMicOk(true)} />
              
              <PermCard
                icon={I.shield}
                title="Accessibility"
                desc="To detect your hotkey and paste into any app."
                granted={a11yOk}
                onGrant={() => setA11yOk(true)} />
              
            </div>

            <div style={{ marginTop: 28, display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 14 }}>
              {!allGranted &&
              <span className="mono" style={{ fontSize: 10.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: R.MUTE }}>
                  Grant both to continue
                </span>
              }
              <button disabled={!allGranted} style={{
                padding: '7px 14px', borderRadius: 7, fontSize: 12.5, fontFamily: 'inherit', fontWeight: 500,
                display: 'inline-flex', alignItems: 'center', gap: 6,
                border: 'none',
                background: allGranted ? R.INK : R.PAPER,
                color: allGranted ? R.CANVAS : R.MUTE,
                cursor: allGranted ? 'pointer' : 'not-allowed',
                opacity: allGranted ? 1 : 0.7
              }}>
                Continue <span style={{ display: 'inline-flex' }}>{I.arrowR({ size: 13 })}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </MacWindow>);

}

function PermCard({ icon, title, desc, granted, info, onGrant }) {
  return (
    <div style={{
      background: R.ELEVATED, border: `1px solid ${R.RULE}`, borderRadius: 12,
      padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: 9, flexShrink: 0,
        background: granted ? R.OLIVE_SOFT : R.PAPER,
        border: `1px solid ${granted ? `${R.OLIVE}33` : R.RULE}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        <span style={{ color: granted ? R.OLIVE_DEEP : R.MUTE, display: 'inline-flex' }}>{icon({ size: 16 })}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: R.INK }}>{title}</div>
        <div style={{ fontSize: 12.5, color: R.MUTE, marginTop: 2, lineHeight: 1.45 }}>{desc}</div>
      </div>
      {granted ?
      <span className="mono" style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        color: R.OLIVE_DEEP, fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase'
      }}>
          <span style={{ display: 'inline-flex' }}>{I.check({ size: 13, strokeWidth: 2.2 })}</span> Granted
        </span> :
      info ? null :
      <button onClick={onGrant} style={{
        background: R.INK, color: R.CANVAS, border: 'none', padding: '7px 12px', borderRadius: 7,
        fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer', fontWeight: 500
      }}>Open Settings</button>
      }
    </div>);

}

// ============================================================
// STEP 2 — MODEL (opinionated, single on-device choice)
// ============================================================
function OnboardingModel() {
  const [showSelector, setShowSelector] = React.useState(false);
  return (
    <MacWindow width={1100} height={780} title="Freestyle">
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: R.CANVAS, position: 'relative' }}>
        <StepsHeader current={1} hidden />
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '40px 80px'
        }}>
          <div style={{ maxWidth: 560, width: '100%' }}>
            <h1 className="serif" style={{ margin: '0 0 30px', fontSize: 56, lineHeight: 0.95, letterSpacing: '-0.025em', color: R.INK, fontWeight: 400, textAlign: 'center' }}>
              <span>Choose a </span>
              <span className="serif-italic" style={{ color: R.OLIVE }}>model.</span>
            </h1>

            {/* The one card */}
            <div style={{
              background: R.ELEVATED, border: `1.5px solid ${R.OLIVE}`, borderRadius: 16,
              padding: 24, position: 'relative', overflow: 'hidden'
            }}>
              <div style={{ position: 'absolute', top: -30, right: -20, opacity: 0.08, pointerEvents: 'none' }}>
                <Wave size={260} color={R.OLIVE} height={120} />
              </div>

              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span className="mono" style={{
                  fontSize: 9.5, padding: '3px 8px', background: R.OLIVE, color: R.CANVAS,
                  borderRadius: 999, letterSpacing: '0.12em', textTransform: 'uppercase'
                }}>Recommended</span>
                <span className="mono" style={{ fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: R.OLIVE_DEEP, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ display: 'inline-flex' }}>{I.shield({ size: 13 })}</span> On-device
                </span>
              </div>

              <div className="serif" style={{ fontSize: 34, color: R.INK, lineHeight: 1.02, letterSpacing: '-0.02em' }}>
                Qwen3 ASR 0.6B
              </div>
              <div style={{ fontSize: 13, color: R.MUTE, marginTop: 4 }}>8-bit quantized · multilingual speech recognition</div>

              <button style={{
                marginTop: 20, width: '100%', height: 48, borderRadius: 10, border: 'none',
                background: R.INK, color: R.CANVAS, fontFamily: 'inherit', fontSize: 15, fontWeight: 600,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10, cursor: 'pointer'
              }}>
                <span style={{ display: 'inline-flex' }}>{I.download({ size: 17 })}</span>
                Download Qwen3 ASR
              </button>
            </div>

            <div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Btn kind="ghost">Back</Btn>
              <button onClick={() => setShowSelector(true)} className="mono" style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                fontSize: 11.5, letterSpacing: '0.04em', color: R.OLIVE_DEEP,
                textDecoration: 'underline', textUnderlineOffset: 3, textDecorationColor: `${R.OLIVE}66`,
                fontFamily: 'inherit'
              }}>Or choose a different model.</button>
            </div>
          </div>
        </div>

        {showSelector && <ModelSelectorOverlay onClose={() => setShowSelector(false)} />}
      </div>
    </MacWindow>);

}

// The "old" model selector — opened from the model step as an option.
function ModelSelectorOverlay({ onClose }) {
  const recs = [
  { p: 'qwen', label: 'On-device', model: 'Qwen3 ASR 0.6B', sub: 'Private · runs on your Mac · no key', selected: true, local: true },
  { p: 'groq', label: 'Groq', model: 'whisper-large-v3-turbo', sub: 'Fastest · ~$0.04/hour · needs API key' },
  { p: 'openai', label: 'OpenAI', model: 'gpt-4o-mini-transcribe', sub: 'Most accurate · ~$0.18/hour · needs API key' },
  { p: 'deepgram', label: 'Deepgram', model: 'nova-3', sub: 'Streaming partials · ~$0.26/hour · needs API key' },
  { p: 'elevenlabs', label: 'ElevenLabs', model: 'scribe-v1', sub: 'Multi-language · ~$0.40/hour · needs API key' }];

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 20,
      background: 'rgba(22,20,15,0.34)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40
    }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxWidth: 600, maxHeight: '100%', display: 'flex', flexDirection: 'column',
        background: R.CANVAS, border: `1px solid ${R.RULE}`, borderRadius: 16,
        boxShadow: '0 24px 60px -16px rgba(20,12,4,0.4)', overflow: 'hidden'
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 22px', borderBottom: `1px solid ${R.RULE_SOFT}`, flexShrink: 0
        }}>
          <div>
            <div className="mono" style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: R.MUTE }}>Choose a model</div>
            <div className="serif" style={{ fontSize: 26, color: R.INK, lineHeight: 1.05, marginTop: 2 }}>All voice models</div>
          </div>
          <button onClick={onClose} style={{
            width: 30, height: 30, borderRadius: 8, border: `1px solid ${R.RULE}`, background: R.ELEVATED,
            color: R.MUTE, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'inherit'
          }}>{I.x ? I.x({ size: 15 }) : '✕'}</button>
        </div>

        <div style={{ padding: 22, overflowY: 'auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {recs.map((r) => <VoiceCard key={r.p} {...r} />)}
          </div>

          {/* API key — only relevant for cloud picks */}
          <div style={{
            marginTop: 18, padding: '14px 16px',
            background: R.PAPER, border: `1px solid ${R.RULE}`, borderRadius: 10,
            display: 'flex', gap: 12, alignItems: 'flex-start'
          }}>
            <span style={{ color: R.MUTE, display: 'inline-flex', flexShrink: 0, marginTop: 2 }}>{I.key({ size: 14 })}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: R.INK, fontWeight: 500 }}>Cloud models need an API key</div>
              <div style={{
                marginTop: 8, padding: '10px 12px', background: R.CANVAS,
                border: `1px solid ${R.RULE}`, borderRadius: 7,
                fontSize: 13, color: R.MUTE, fontFamily: 'JetBrains Mono', letterSpacing: '0.04em'
              }}>Paste key — e.g. gsk_••••••••••••••••••••</div>
              <div style={{ fontSize: 11.5, color: R.MUTE, marginTop: 6 }}>
                Stored in your system keychain. Never logged, never sent to us.
              </div>
            </div>
          </div>
        </div>

        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '16px 22px', borderTop: `1px solid ${R.RULE_SOFT}`, flexShrink: 0
        }}>
          <Btn kind="ghost">Cancel</Btn>
          <Btn kind="primary" icon={I.check}>Use selected model</Btn>
        </div>
      </div>
    </div>);

}

function VoiceCard({ label, model, sub, selected, local }) {
  return (
    <div style={{
      background: selected ? R.ELEVATED : 'transparent',
      border: `1px solid ${selected ? R.OLIVE : R.RULE}`,
      borderRadius: 11, padding: '14px 18px',
      display: 'flex', alignItems: 'center', gap: 16
    }}>
      <div style={{
        width: 18, height: 18, borderRadius: '50%',
        background: selected ? R.OLIVE : 'transparent',
        border: `1.5px solid ${selected ? R.OLIVE : R.RULE}`,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0
      }}>
        {selected && <span style={{ width: 6, height: 6, borderRadius: '50%', background: R.CANVAS }} />}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="mono" style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: local ? R.OLIVE_DEEP : R.MUTE, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            {local && <span style={{ display: 'inline-flex' }}>{I.shield({ size: 11 })}</span>}{label}
          </span>
          {selected &&
          <span className="mono" style={{
            fontSize: 9, padding: '2px 6px', background: R.OLIVE, color: R.CANVAS,
            borderRadius: 999, letterSpacing: '0.12em'
          }}>RECOMMENDED</span>
          }
        </div>
        <div className="serif" style={{ fontSize: 26, color: R.INK, lineHeight: 1.05, marginTop: 2, letterSpacing: '-0.015em' }}>
          {model}
        </div>
        <div style={{ fontSize: 12.5, color: R.MUTE, marginTop: 4 }}>{sub}</div>
      </div>
    </div>);

}

// ============================================================
// STEP 3 — HOW TO USE (tutorial with text input)
// ============================================================
function OnboardingTutorial() {
  const [hotkey, setHotkey] = React.useState('fn');
  const [listening, setListening] = React.useState(false);
  return (
    <MacWindow width={1100} height={780} title="Freestyle">
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: R.CANVAS }}>
        <StepsHeader current={2} hidden />
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: '36px 80px'
        }}>
          <div style={{ maxWidth: 560, width: '100%' }}>
            <h1 className="serif" style={{ margin: 0, fontSize: 56, lineHeight: 0.95, letterSpacing: '-0.025em', color: R.INK, fontWeight: 400, textAlign: 'center' }}>
              <span>Press {hotkey}, speak, </span>
              <span className="serif-italic" style={{ color: R.OLIVE }}>release.</span>
            </h1>

            {/* Hotkey — single minimal control, matches the app */}
            <div style={{ marginTop: 30, display: 'flex', justifyContent: 'center' }}>
              {!listening ? (
                <button onClick={() => setListening(true)} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 12, cursor: 'pointer', fontFamily: 'inherit',
                  background: R.ELEVATED, border: `1px solid ${R.RULE}`, borderRadius: 10, padding: '9px 14px'
                }}>
                  <span style={{ color: R.MUTE, display: 'inline-flex' }}>{I.keyboard({ size: 16 })}</span>
                  <Keycap held>{hotkey}</Keycap>
                  <span style={{ fontSize: 12.5, color: R.MUTE }}>Change</span>
                </button>
              ) : (
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 12,
                  background: R.OLIVE_SOFT, border: `1px solid ${R.OLIVE}`, borderRadius: 10, padding: '9px 14px'
                }}>
                  <span style={{ color: R.OLIVE_DEEP, display: 'inline-flex' }}>{I.keyboard({ size: 16 })}</span>
                  <span className="mono" style={{ fontSize: 12.5, color: R.OLIVE_INK }}>Press a key…</span>
                  <button onClick={() => setListening(false)} style={{
                    fontFamily: 'inherit', fontSize: 12, color: R.MUTE, background: R.CANVAS,
                    border: `1px solid ${R.RULE}`, borderRadius: 7, padding: '4px 10px', cursor: 'pointer'
                  }}>Cancel</button>
                </div>
              )}
            </div>

            {/* Simple practice box */}
            <div style={{
              marginTop: 16,
              background: R.CANVAS, border: `1.5px solid ${R.OLIVE}`, borderRadius: 12,
              padding: '22px 20px', minHeight: 96, display: 'flex', alignItems: 'center', gap: 4,
              fontSize: 18, lineHeight: 1.5
            }}>
              <span style={{
                display: 'inline-block', width: 2, height: 22, background: R.OLIVE, marginRight: 6,
                verticalAlign: '-4px'
              }} />
              <span style={{ color: R.MUTE }}>Hold <strong style={{ color: R.INK, fontWeight: 600 }}>{hotkey}</strong>, say something, then release — your words land right here.</span>
            </div>

            <div style={{ marginTop: 26, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Btn kind="ghost">Back</Btn>
              <Btn kind="olive" icon={I.arrowR}>Start using Freestyle</Btn>
            </div>
          </div>
        </div>
      </div>
    </MacWindow>);

}

Object.assign(window, {
  OnboardingPermissions, OnboardingModel, OnboardingTutorial
});