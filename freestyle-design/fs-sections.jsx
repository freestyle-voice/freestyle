// Freestyle landing — static marketing sections.
// All accept `accent` (one of ACCENTS.*) so the Tweaks accent flows through.

const LOGO_WAVE = "8.00,50.00 9.40,49.85 10.80,49.42 12.20,48.76 13.60,47.98 15.00,47.18 16.40,46.50 17.80,46.06 19.20,45.96 20.60,46.29 22.00,47.08 23.40,48.34 24.80,50.00 26.20,51.96 27.60,54.08 29.00,56.19 30.40,58.08 31.80,59.58 33.20,60.50 34.60,60.71 36.00,60.10 37.40,58.66 38.80,56.42 40.20,53.47 41.60,50.00 43.00,46.23 44.40,42.42 45.80,38.86 47.20,35.85 48.60,33.66 50.00,32.50 51.40,32.53 52.80,33.83 54.20,36.39 55.60,40.08 57.00,44.72 58.40,50.00 59.80,55.59 61.20,61.08 62.60,66.09 64.00,70.21 65.40,73.10 66.80,74.50 68.20,74.23 69.60,72.23 71.00,68.56 72.40,63.42 73.80,57.10 75.20,50.00 76.60,42.60 78.00,35.42 79.40,28.96 80.80,23.73 82.20,20.14 83.60,18.50 85.00,19.01 86.40,21.71 87.80,26.49 89.20,33.08 90.60,41.09 92.00,50.00";

const GH = "M12 0C5.37 0 0 5.37 0 12c0 5.3 3.44 9.8 8.21 11.39.6.11.82-.26.82-.58 0-.29-.01-1.04-.02-2.04-3.34.73-4.04-1.61-4.04-1.61-.55-1.39-1.34-1.76-1.34-1.76-1.09-.74.08-.73.08-.73 1.21.09 1.85 1.24 1.85 1.24 1.07 1.84 2.81 1.31 3.5 1 .11-.78.42-1.31.76-1.61-2.66-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.12-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.31 1.23A11.5 11.5 0 0 1 12 5.8c1.02 0 2.05.14 3.01.4 2.3-1.55 3.31-1.23 3.31-1.23.66 1.66.24 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.82 5.63-5.49 5.92.43.37.81 1.1.81 2.22 0 1.6-.02 2.89-.02 3.29 0 .32.22.7.83.58A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z";

// ============================================================
// NAV
// ============================================================
function Nav({ accent }) {
  return (
    <nav style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 32, padding: '28px clamp(24px,5vw,56px)', position: 'relative', zIndex: 10 }}>
      <a href="#top" style={{ display: 'inline-flex', alignItems: 'center', gap: 13, textDecoration: 'none', color: FT.ink }}>
        <svg viewBox="0 0 100 100" width="34" height="34" aria-hidden="true">
          <polyline points={LOGO_WAVE} fill="none" stroke={accent.base} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="serif-italic" style={{ fontSize: 30, letterSpacing: '-0.015em', lineHeight: 1 }}>freestyle<span style={{ color: accent.base }}>.</span></span>
      </a>
      <div className="fs-navlinks" style={{ display: 'inline-flex', alignItems: 'center', gap: 30 }}>
        {[['Features', '#features'], ['Blog', 'Freestyle Blog.html'], ['Docs', '#'], ['Changelog', '#']].map(([t, h]) => (
          <a key={t} href={h} className="fs-navlink" style={{ fontSize: 15, color: FT.inkSoft, textDecoration: 'none' }}>{t}</a>
        ))}
        <a href="https://github.com/freestyle-voice/freestyle" target="_blank" rel="noopener" className="fs-navlink" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 15, color: FT.inkSoft, textDecoration: 'none' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={GH} /></svg>GitHub
        </a>
      </div>
    </nav>
  );
}

// ============================================================
// HERO
// ============================================================
function Hero({ accent }) {
  return (
    <header style={{ textAlign: 'center', padding: 'clamp(40px,7vh,90px) clamp(24px,5vw,56px) 10px', maxWidth: 940, margin: '0 auto' }}>
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 15px', borderRadius: 999, border: `1px solid ${FT.rule}`, background: FT.paper, marginBottom: 28, whiteSpace: 'nowrap' }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: accent.base }} />
        <span className="mono" style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: FT.mute }}>Open source · local-first · free</span>
      </div>
      <h1 className="serif" style={{ margin: 0, fontWeight: 400, fontSize: 'clamp(44px,6.5vw,92px)', lineHeight: 1.05, letterSpacing: '-0.035em', color: FT.ink }}>
        Stop typing.<br />Speak <span className="serif-italic" style={{ color: accent.base }}>freely</span>.
      </h1>
      <p style={{ margin: '28px auto 0', maxWidth: 600, fontSize: 'clamp(16px,1.6vw,20px)', lineHeight: 1.55, color: FT.inkSoft, textWrap: 'pretty' }}>
        Hold a hotkey, talk, release — clean text appears wherever your cursor is. Speak 4× faster than you type.
      </p>
      <div style={{ marginTop: 38, display: 'inline-flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
        <a href="#" className="fs-btn fs-btn-primary" style={btnPrimary()}>
          Download for macOS
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </a>
        <a href="https://github.com/freestyle-voice/freestyle" target="_blank" rel="noopener" className="fs-btn fs-btn-ghost" style={btnGhost()}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={GH} /></svg>Star on GitHub
        </a>
      </div>
    </header>
  );
}

// ============================================================
// DEMO SECTION — wraps the interactive FreestyleDemo
// ============================================================
function DemoSection({ accent, staging, accentName }) {
  return (
    <section id="demo" style={{ padding: 'clamp(48px,8vh,110px) clamp(24px,5vw,56px)', maxWidth: 1120, margin: '0 auto' }}>
      <FreestyleDemo staging={staging} accentName={accentName} />
    </section>
  );
}

// ============================================================
// HOW IT WORKS
// ============================================================
function HowItWorks({ accent }) {
  const steps = [
    ['01', 'Hold the key', 'Press and hold your hotkey from anywhere. Freestyle starts listening instantly.'],
    ['02', 'Just talk', 'Say it how you’d say it. The waveform shows it’s hearing you, on-device.'],
    ['03', 'Release', 'Let go. Clean, punctuated text is pasted at your cursor in milliseconds.'],
  ];
  return (
    <section id="how" style={{ padding: 'clamp(40px,6vh,80px) clamp(24px,5vw,56px)', maxWidth: 1120, margin: '0 auto', borderTop: `1px solid ${FT.rule}` }}>
      <div style={{ marginBottom: 44 }}>
        <span className="mono" style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: accent.deep }}>How it works</span>
        <h2 className="serif" style={{ margin: '12px 0 0', fontWeight: 400, fontSize: 'clamp(28px,3.6vw,44px)', letterSpacing: '-0.025em', color: FT.ink }}>
          Three motions. No menus.
        </h2>
      </div>
      <div className="fs-3col" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 1, background: FT.rule, border: `1px solid ${FT.rule}`, borderRadius: 16, overflow: 'hidden' }}>
        {steps.map(([n, t, d]) => (
          <div key={n} style={{ background: FT.canvas, padding: '32px 30px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <span className="serif-italic" style={{ fontSize: 44, lineHeight: 1, color: accent.base }}>{n}</span>
            <div style={{ fontSize: 19, fontWeight: 500, color: FT.ink }}>{t}</div>
            <p style={{ margin: 0, fontSize: 14.5, color: FT.mute, lineHeight: 1.55, textWrap: 'pretty' }}>{d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ============================================================
// FEATURES
// ============================================================
function Features({ accent }) {
  const items = [
    ['Your model, your key', 'OpenAI, Groq, Anthropic, Google, Deepgram, ElevenLabs. Bring your own API key.'],
    ['Cleanup, built in', 'Removes the “um”s and fixes punctuation automatically. No editing pass needed.'],
    ['Custom dictionary', '“type script” → TypeScript. Teach it your names, terms and shorthand.'],
    ['Contextual correction', 'Knows where you’re typing — formats an email like an email, a commit like a commit.'],
    ['Local-first & private', 'Your dictations stay on your device. Nothing leaves unless you choose a cloud model.'],
    ['Free & open source', 'Every platform: macOS, Windows, Linux. Read the code, send a PR.'],
  ];
  return (
    <section id="features" style={{ padding: 'clamp(40px,6vh,80px) clamp(24px,5vw,56px)', maxWidth: 1120, margin: '0 auto', borderTop: `1px solid ${FT.rule}` }}>
      <div style={{ marginBottom: 44, maxWidth: 640 }}>
        <span className="mono" style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: accent.deep }}>Features</span>
        <h2 className="serif" style={{ margin: '12px 0 0', fontWeight: 400, fontSize: 'clamp(28px,3.6vw,44px)', letterSpacing: '-0.025em', color: FT.ink }}>
          Small app. <span className="serif-italic" style={{ color: accent.base }}>Serious about text.</span>
        </h2>
      </div>
      <div className="fs-3col" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 18 }}>
        {items.map(([t, d]) => (
          <div key={t} style={{ background: FT.elevated, border: `1px solid ${FT.rule}`, borderRadius: 14, padding: '24px 24px 26px', display: 'flex', flexDirection: 'column', gap: 9 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: accent.base, marginBottom: 4 }} />
            <div style={{ fontSize: 17.5, fontWeight: 500, color: FT.ink }}>{t}</div>
            <p style={{ margin: 0, fontSize: 14.5, color: FT.mute, lineHeight: 1.55, textWrap: 'pretty' }}>{d}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

// ============================================================
// FOOTER CTA
// ============================================================
function FooterCTA({ accent }) {
  return (
    <footer style={{ borderTop: `1px solid ${FT.rule}`, marginTop: 'clamp(40px,6vh,80px)' }}>
      <div style={{ textAlign: 'center', padding: 'clamp(64px,10vh,130px) clamp(24px,5vw,56px) clamp(48px,7vh,90px)', maxWidth: 820, margin: '0 auto' }}>
        <h2 className="serif" style={{ margin: 0, fontWeight: 400, fontSize: 'clamp(40px,6vw,80px)', lineHeight: 1.05, letterSpacing: '-0.035em', color: FT.ink }}>
          Stop typing.<br /><span className="serif-italic" style={{ color: accent.base }}>Speak freely.</span>
        </h2>
        <div style={{ marginTop: 36, display: 'inline-flex', gap: 14, flexWrap: 'wrap', justifyContent: 'center' }}>
          <a href="#" className="fs-btn fs-btn-primary" style={btnPrimary()}>
            Download for macOS
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M2 7h10M8 3l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
          </a>
          <a href="https://github.com/freestyle-voice/freestyle" target="_blank" rel="noopener" className="fs-btn fs-btn-ghost" style={btnGhost()}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={GH} /></svg>Star on GitHub
          </a>
        </div>
        <div className="mono" style={{ marginTop: 22, fontSize: 12, color: FT.mute, letterSpacing: '0.04em' }}>macOS · Windows · Linux — FSL-1.1-ALv2</div>
      </div>
      <div style={{ borderTop: `1px solid ${FT.rule}`, padding: '24px clamp(24px,5vw,56px)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap', maxWidth: 1120, margin: '0 auto' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <svg viewBox="0 0 100 100" width="22" height="22" aria-hidden="true"><polyline points={LOGO_WAVE} fill="none" stroke={accent.base} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" /></svg>
          <span className="serif-italic" style={{ fontSize: 19 }}>freestyle<span style={{ color: accent.base }}>.</span></span>
        </span>
        <div style={{ display: 'inline-flex', gap: 24, flexWrap: 'wrap' }}>
          {[['GitHub', 'https://github.com/freestyle-voice/freestyle'], ['Discord', 'https://discord.gg/Fmgt5yZCDu'], ['Docs', '#'], ['Changelog', '#']].map(([t, h]) => (
            <a key={t} href={h} target={h.startsWith('http') ? '_blank' : undefined} rel="noopener" className="fs-navlink" style={{ fontSize: 14, color: FT.mute, textDecoration: 'none' }}>{t}</a>
          ))}
        </div>
      </div>
    </footer>
  );
}

// ---- shared button styles (colors live in CSS so :hover can use live accent) ----
function btnPrimary() {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 10, height: 50, padding: '0 22px',
    borderRadius: 10, fontSize: 14.5, fontWeight: 500, textDecoration: 'none', cursor: 'pointer',
  };
}
const btnGhost = btnPrimary;

Object.assign(window, { Nav, Hero, DemoSection, HowItWorks, Features, FooterCTA });
