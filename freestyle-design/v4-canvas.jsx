// Freestyle — Studio canvas composition + masthead poster + boot.

function V4BrandCanvas() {
  return (
    <DesignCanvas>
      <DCSection id="overview" title="Freestyle — Studio"
        subtitle="Light editorial direction. Sidebar restored, olive-only accent, flourish logo.">
        <DCArtboard id="masthead" label="Masthead poster" width={1100} height={720}>
          <V4MastheadPoster />
        </DCArtboard>
      </DCSection>

      <DCSection id="system" title="System" subtitle="Logo, color, type, motifs.">
        <DCArtboard id="logo" label="01 · Logo" width={1100} height={700}>
          <V4LogoCard />
        </DCArtboard>
        <DCArtboard id="palette" label="02 · Color" width={1100} height={700}>
          <V4PaletteCard />
        </DCArtboard>
        <DCArtboard id="type" label="03 · Type" width={1100} height={700}>
          <V4TypeCard />
        </DCArtboard>
        <DCArtboard id="motifs" label="04 · Motifs" width={1100} height={700}>
          <V4MotifsCard />
        </DCArtboard>
      </DCSection>

      <DCSection id="app" title="App UI" subtitle="Sidebar + masthead + feed. Settings as bento.">
        <DCArtboard id="home" label="Today (Home)" width={1100} height={720}>
          <V4HomeArtboard />
        </DCArtboard>
        <DCArtboard id="settings" label="Settings · bento" width={1100} height={720}>
          <V4SettingsArtboard />
        </DCArtboard>
      </DCSection>

      <DCSection id="pill" title="Floating pill" subtitle="Always-on-top dictation widget — four states.">
        <DCArtboard id="pill-states" label="States" width={1100} height={700}>
          <V4PillArtboard />
        </DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}

// =============== MASTHEAD POSTER (hero) ===============
function V4MastheadPoster() {
  return (
    <div style={{
      width: 1100, height: 720, background: V4.CANVAS,
      padding: 56, boxSizing: 'border-box', position: 'relative', overflow: 'hidden',
      display:'flex', flexDirection:'column',
    }}>
      <div style={{ position:'absolute', top: 20, left: 20 }}><Crosshair4 /></div>
      <div style={{ position:'absolute', top: 20, right: 20 }}><Crosshair4 /></div>
      <div style={{ position:'absolute', bottom: 20, left: 20 }}><Crosshair4 /></div>
      <div style={{ position:'absolute', bottom: 20, right: 20 }}><Crosshair4 /></div>

      {/* Top masthead row */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink: 0 }}>
        <div className="mono" style={{ fontSize: 11.5, letterSpacing: '0.18em', textTransform:'uppercase', color: V4.INK_SOFT }}>
          Freestyle · brand v0.4 · studio
        </div>
        <RecBadge4 text="REC" />
      </div>

      {/* Top double hairline */}
      <div style={{ height: 1, background: V4.INK, margin: '14px 0 0' }} />
      <div style={{ height: 3, background: V4.INK, margin: '3px 0 0' }} />

      {/* Date row */}
      <div style={{ display:'flex', alignItems:'baseline', justifyContent:'space-between', margin: '18px 0 0' }}>
        <span className="mono" style={{ fontSize: 11, letterSpacing:'0.2em', textTransform:'uppercase', color: V4.MUTE }}>
          Thursday · May 28 · 2026
        </span>
        <span className="mono" style={{ fontSize: 11, letterSpacing:'0.2em', textTransform:'uppercase', color: V4.MUTE }}>
          Issue №1,247
        </span>
      </div>

      {/* Center hero */}
      <div style={{ flex: 1, display:'flex', flexDirection:'column', justifyContent:'center', gap: 22, position:'relative' }}>
        <h1 style={{ margin: 0, position:'relative', zIndex: 1 }}>
          <span className="serif" style={{
            fontSize: 196, color: V4.INK, lineHeight: 0.86, letterSpacing: '-0.04em', fontWeight: 400,
          }}>Speak</span>
          <br />
          <span className="serif-italic" style={{
            fontSize: 196, color: V4.OLIVE, lineHeight: 0.86, letterSpacing: '-0.02em',
          }}>freely</span>
          <span className="serif" style={{ fontSize: 196, color: V4.INK, lineHeight: 0.86, letterSpacing: '-0.04em' }}>.</span>
        </h1>

        {/* trace under the headline */}
        <div style={{ position:'absolute', left: -80, right: -80, bottom: 30, opacity: 0.18, pointerEvents:'none' }}>
          <ScopeTrace4 width={1300} height={140} cycles={3.4} weight={1.5} opacity={0.9} />
        </div>

        {/* Big flourish off to the upper right, like a calligrapher's signature */}
        <div style={{ position:'absolute', top: -20, right: -30, opacity: 0.9 }}>
          <MarkFlourish size={220} color={V4.OLIVE} weight={6} />
        </div>
      </div>

      {/* Bottom row */}
      <div style={{ borderTop: `1px solid ${V4.INK}`, paddingTop: 16, display:'flex', justifyContent:'space-between', alignItems:'flex-end' }}>
        <div style={{ display:'flex', alignItems:'center', gap: 14 }}>
          <MarkFlourish size={44} color={V4.OLIVE} weight={3.8} />
          <div>
            <V4Wordmark size={32} color={V4.INK} accent={V4.OLIVE} />
            <div className="mono" style={{ fontSize: 10.5, color: V4.MUTE, letterSpacing:'0.16em', textTransform:'uppercase', marginTop: 4 }}>
              voice dictation · macOS · open source
            </div>
          </div>
        </div>
        <div style={{ textAlign:'right', maxWidth: 360 }}>
          <p style={{
            margin: 0, fontSize: 15, lineHeight: 1.45, color: V4.INK_SOFT, fontWeight: 400,
            letterSpacing: '-0.005em', textWrap: 'pretty',
          }}>
            Runs on your laptop. Pastes where your cursor is. Never sends a syllable unless you ask.
          </p>
          <div style={{ marginTop: 10, display:'flex', justifyContent:'flex-end' }}>
            <TickAxis4 width={200} ticks={16} color={V4.MUTE} />
          </div>
        </div>
      </div>
    </div>
  );
}

// =============== BOOT ===============
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<V4BrandCanvas />);
