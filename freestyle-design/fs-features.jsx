// Freestyle landing — features section. Simple, text-forward, no animation.

const FS_FEATURES = [
  ['Custom dictionary',      'Teach it your terms — “type script” becomes TypeScript, every time.'],
  ['Contextual correction',  'Formats to fit where you type: an email, a commit, or a chat message.'],
  ['Local-first & private',  'Transcribed on your machine. Your voice never leaves it.'],
  ['Bring your own model',   'OpenAI, Groq, Anthropic, Google, Deepgram, ElevenLabs — your key.'],
  ['Clean by default',       'Strips filler words and fixes punctuation automatically.'],
  ['Free & open source',     'macOS, Windows, Linux. Read the code, send a PR.'],
];

function CapabilitiesSection({ accent }) {
  return (
    <section id="features" style={{ padding: 'clamp(44px,7vh,90px) clamp(24px,5vw,56px)', maxWidth: 1120, margin: '0 auto', borderTop: `1px solid ${FT.rule}` }}>
      <div style={{ marginBottom: 'clamp(32px,4vh,48px)', maxWidth: 640 }}>
        <span className="mono" style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: accent.deep }}>Features</span>
        <p style={{ margin: '12px 0 0', fontSize: 'clamp(18px,2.2vw,24px)', color: FT.ink, lineHeight: 1.4, textWrap: 'pretty' }}>
          Everything happens after you speak — and most of it on your own machine.
        </p>
      </div>
      <div className="fs-3col" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '1px', background: FT.rule, border: `1px solid ${FT.rule}`, borderRadius: 14, overflow: 'hidden' }}>
        {FS_FEATURES.map(([t, d]) => (
          <div key={t} style={{ background: FT.canvas, padding: 'clamp(22px,2.4vw,30px)', display: 'flex', flexDirection: 'column', gap: 9 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: accent.base, marginBottom: 3 }} />
            <div style={{ fontSize: 18, fontWeight: 500, color: FT.ink }}>{t}</div>
            <p style={{ margin: 0, fontSize: 15, color: FT.mute, lineHeight: 1.55, textWrap: 'pretty' }}>{d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

Object.assign(window, { CapabilitiesSection });
