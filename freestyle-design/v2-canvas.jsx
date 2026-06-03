// Freestyle — After Hours canvas composition + brand poster + boot.

function V2BrandCanvas() {
  return (
    <DesignCanvas>
      <DCSection id="overview" title="Freestyle — After Hours"
        subtitle="A nocturnal studio direction. Deep ink, warm cream, one electric chartreuse.">
        <DCArtboard id="poster" label="Brand poster" width={1100} height={720}>
          <V2BrandPoster />
        </DCArtboard>
      </DCSection>

      <DCSection id="system" title="System" subtitle="Logo, color, type, motifs.">
        <DCArtboard id="logo" label="01 · Logo" width={1100} height={700}>
          <V2LogoCard />
        </DCArtboard>
        <DCArtboard id="palette" label="02 · Color" width={1100} height={700}>
          <V2PaletteCard />
        </DCArtboard>
        <DCArtboard id="type" label="03 · Type" width={1100} height={700}>
          <V2TypeCard />
        </DCArtboard>
        <DCArtboard id="motifs" label="04 · Motifs" width={1100} height={700}>
          <V2MotifsCard />
        </DCArtboard>
      </DCSection>

      <DCSection id="app" title="App UI" subtitle="The macOS app, rebuilt on the system.">
        <DCArtboard id="home" label="Home" width={1100} height={720}>
          <V2HomeArtboard />
        </DCArtboard>
        <DCArtboard id="settings" label="Settings" width={1100} height={720}>
          <V2SettingsArtboard />
        </DCArtboard>
      </DCSection>

      <DCSection id="pill" title="Floating pill" subtitle="Always-on-top dictation widget — four states.">
        <DCArtboard id="pill-states" label="States" width={1100} height={700}>
          <V2PillArtboard />
        </DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}

// =============== BRAND POSTER (hero) ===============
function V2BrandPoster() {
  return (
    <div style={{
      width: 1100, height: 720, background: V2.VOID,
      padding: 56, boxSizing: 'border-box', position: 'relative', overflow: 'hidden',
      display:'flex', flexDirection:'column', justifyContent:'space-between',
    }}>
      {/* corner crosshairs */}
      <div style={{ position:'absolute', top: 20, left: 20 }}><Crosshair color={V2.RULE} /></div>
      <div style={{ position:'absolute', top: 20, right: 20 }}><Crosshair color={V2.RULE} /></div>
      <div style={{ position:'absolute', bottom: 20, left: 20 }}><Crosshair color={V2.RULE} /></div>
      <div style={{ position:'absolute', bottom: 20, right: 20 }}><Crosshair color={V2.RULE} /></div>

      {/* faint scope trace running diagonally behind the type */}
      <div style={{ position:'absolute', top: 200, left: -80, opacity: 0.7 }}>
        <ScopeTrace width={1280} height={180} cycles={3.2} weight={1.4} opacity={0.85} />
      </div>

      {/* second, much fainter trace, offset and lower amplitude */}
      <div style={{ position:'absolute', top: 380, left: -40, opacity: 0.35 }}>
        <ScopeTrace width={1200} height={80} cycles={5.8} weight={1} phase={1.4} opacity={0.7} />
      </div>

      {/* top bar */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', position:'relative', zIndex: 2 }}>
        <div className="mono" style={{ fontSize: 11.5, letterSpacing:'0.18em', textTransform:'uppercase', color: V2.TEXT_SOFT }}>
          Freestyle · brand v0.2 · after hours
        </div>
        <div style={{ display:'flex', alignItems:'center', gap: 10 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: V2.LIME, boxShadow: `0 0 10px ${V2.LIME}` }} />
          <span className="mono" style={{ fontSize: 11, color: V2.LIME, letterSpacing:'0.14em' }}>REC</span>
        </div>
      </div>

      {/* center hero */}
      <div style={{ display:'flex', flexDirection:'column', gap: 28, maxWidth: 980, position:'relative', zIndex: 2 }}>
        <h1 style={{ margin: 0 }}>
          <span className="serif" style={{
            fontSize: 220, color: V2.TEXT, lineHeight: 0.85, letterSpacing: '-0.04em', fontWeight: 400,
          }}>Speak</span>
          <br />
          <span className="serif-italic glow-lime" style={{
            fontSize: 220, color: V2.LIME, lineHeight: 0.85, letterSpacing: '-0.02em',
          }}>freely</span>
          <span className="serif" style={{ fontSize: 220, color: V2.TEXT, lineHeight: 0.85, letterSpacing: '-0.04em' }}>.</span>
        </h1>

        <p style={{
          margin: 0, fontSize: 22, lineHeight: 1.45, color: V2.TEXT_SOFT, maxWidth: 720,
          fontWeight: 400, letterSpacing: '-0.005em', textWrap: 'pretty',
        }}>
          Voice dictation that runs on your laptop, pastes where your cursor is, and never sends a syllable to the cloud unless you ask it to.
        </p>
      </div>

      {/* bottom row: mark + wordmark, build label, big slash glyph */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', position:'relative', zIndex: 2 }}>
        <div style={{ display:'flex', alignItems:'center', gap: 14 }}>
          <MarkSlash size={44} />
          <V2Wordmark size={36} color={V2.TEXT} accent={V2.LIME} />
        </div>
        <div style={{ textAlign:'right' }}>
          <div className="mono" style={{ fontSize: 10.5, color: V2.MUTE, letterSpacing:'0.18em', textTransform:'uppercase' }}>
            voice → cursor · 1 keystroke
          </div>
          <div style={{ marginTop: 8 }}>
            <TickAxis width={220} ticks={16} color={V2.MUTE} />
          </div>
        </div>
      </div>
    </div>
  );
}

// =============== BOOT ===============
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<V2BrandCanvas />);
