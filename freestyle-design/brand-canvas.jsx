// Freestyle — brand canvas composition.
// Pulls all artboards into a single design_canvas layout with sections.

function BrandCanvas() {
  return (
    <DesignCanvas>
      <DCSection id="overview" title="Freestyle — Brand"
        subtitle="A voice dictation app that flows. Warm paper, ink scribbles, one coral pop.">
        <DCArtboard id="hero" label="Brand poster" width={1100} height={720}>
          <BrandPoster />
        </DCArtboard>
      </DCSection>

      <DCSection id="system" title="System" subtitle="Logo, color, type, marks.">
        <DCArtboard id="logo" label="01 · Logo" width={1100} height={700}>
          <LogoCard />
        </DCArtboard>
        <DCArtboard id="palette" label="02 · Color" width={1100} height={700}>
          <PaletteCard />
        </DCArtboard>
        <DCArtboard id="type" label="03 · Type" width={1100} height={700}>
          <TypeCard />
        </DCArtboard>
        <DCArtboard id="illos" label="04 · Marks" width={1100} height={700}>
          <IllustrationCard />
        </DCArtboard>
      </DCSection>

      <DCSection id="app" title="App UI" subtitle="The macOS app, rebuilt on the system.">
        <DCArtboard id="home" label="Home" width={1100} height={720}>
          <HomeArtboard />
        </DCArtboard>
        <DCArtboard id="settings" label="Settings" width={1100} height={720}>
          <SettingsArtboard />
        </DCArtboard>
      </DCSection>

      <DCSection id="pill" title="Floating pill" subtitle="Always-on-top dictation widget — four states.">
        <DCArtboard id="pill-states" label="States" width={1100} height={700}>
          <PillArtboard />
        </DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}

// =============== BRAND POSTER (hero) ===============
// A loose composition that sets the tone before you see the system.
function BrandPoster() {
  return (
    <div style={{
      width: 1100, height: 720, background: PAPER,
      padding: 56, boxSizing: 'border-box', position: 'relative', overflow: 'hidden',
      display:'flex', flexDirection:'column', justifyContent:'space-between',
    }}>
      {/* corner runes */}
      <div style={{ position:'absolute', top: 36, right: 56 }}>
        <DotLine count={6} gap={16} dot={6} color={INK} accent={CORAL} accentIdx={2} />
      </div>
      <div style={{ position:'absolute', top: 80, right: 56, opacity: 0.6 }}>
        <Squiggle width={220} height={32} stroke={INK} weight={2.5} />
      </div>
      <div style={{ position:'absolute', bottom: 56, left: 56, display:'flex', alignItems:'center', gap: 14 }}>
        <MarkResolve size={42} color={INK} />
        <Wordmark size={28} color={INK} accent={CORAL} />
      </div>

      {/* top bar */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div className="mono" style={{ fontSize: 12, letterSpacing:'0.14em', textTransform:'uppercase', color: INK_SOFT }}>
          Freestyle · brand v0.1
        </div>
      </div>

      {/* center */}
      <div style={{ display:'flex', flexDirection:'column', gap: 28, maxWidth: 880 }}>
        <h1 className="display" style={{
          margin: 0, fontSize: 200, fontWeight: 700, lineHeight: 0.85,
          letterSpacing: '-0.04em', fontVariationSettings: `'wdth' 80, 'opsz' 96`,
          color: INK,
        }}>
          Speak<br />
          <span style={{ position:'relative', display:'inline-block' }}>
            <span style={{ fontStyle: 'italic', fontWeight: 500, color: CORAL, fontVariationSettings: `'wdth' 100, 'opsz' 96` }}>freely</span>
            <span style={{ position:'absolute', left:'-2%', right:'-2%', bottom: -28 }}>
              <Underwave width={520} height={28} color={INK} weight={5} />
            </span>
          </span>.
        </h1>

        <p style={{
          margin: 0, fontSize: 22, lineHeight: 1.4, color: INK_SOFT, maxWidth: 720,
          fontWeight: 450, letterSpacing: '-0.01em', textWrap: 'pretty',
        }}>
          Voice dictation that runs on your laptop, pastes where your cursor is, and never sends a syllable to the cloud unless you ask it to.
        </p>
      </div>

      <div style={{ display:'flex', justifyContent:'flex-end', alignItems:'flex-end', gap: 24 }}>
        <LoopMark size={84} stroke={CORAL} weight={4} />
      </div>
    </div>
  );
}

// =============== BOOT ===============
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<BrandCanvas />);
