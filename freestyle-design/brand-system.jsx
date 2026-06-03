// Freestyle — brand system cards (logo, palette, type, illustration).
// Each card is a self-contained artboard meant to live inside DCArtboard.

const PAPER = '#F1EBDD';
const PAPER_DEEP = '#E7DFCC';
const INK = '#1B1814';
const INK_SOFT = '#2B2620';
const MUTE = '#8E8473';
const RULE = '#D8CFB9';
const CORAL = '#F5511D';
const CORAL_SOFT = '#FBB89E';
const SAGE = '#6E8A6A';
const SAGE_SOFT = '#BFCFB9';
const BUTTER = '#F3CB58';

// =================== LOGO CARD ===================
// "Resolve" is the recommended mark — a single bold stroke that enters as a
// wave and resolves into a clean line. Reads as: voice → text in one gesture.
// Drops the circle wrapper and earns its own silhouette at 16px.
function LogoCard() {
  return (
    <div style={{
      width: 1100, height: 700, background: PAPER,
      padding: 48, boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', gap: 24,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <Eyebrow text="01 — Identity" />
        <div style={{ fontSize: 12.5, color: MUTE, maxWidth: 380, textAlign:'right', lineHeight: 1.5 }}>
          Six iconic marks — no container, single gesture each. <strong style={{ color: INK }}>Resolve</strong> is the recommendation: voice enters as a wave, settles into a line.
        </div>
      </div>

      {/* Hero — chosen mark + wordmark, big */}
      <div style={{
        background: PAPER_DEEP, borderRadius: 16, padding: '36px 40px',
        display:'flex', alignItems:'center', justifyContent:'space-between', gap: 32,
        position:'relative', overflow:'hidden',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap: 28 }}>
          <MarkResolve size={120} color={INK} />
          <Wordmark size={88} color={INK} accent={CORAL} />
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap: 8, textAlign:'right' }}>
          <div className="mono" style={{ fontSize: 11, letterSpacing: '0.14em', textTransform:'uppercase', color: CORAL, fontWeight: 600 }}>
            Recommended
          </div>
          <div className="display" style={{ fontSize: 28, fontWeight: 600, color: INK, fontVariationSettings: `'wdth' 90`, lineHeight: 1 }}>
            Resolve
          </div>
          <div style={{ fontSize: 12, color: MUTE, lineHeight: 1.4, maxWidth: 200 }}>
            Speech in. Text out. One stroke.
          </div>
        </div>
      </div>

      {/* 6-mark exploration grid */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(6, 1fr)', gap: 12 }}>
        <MarkOption name="Resolve" tag="01" recommended>
          <MarkResolve size={84} color={INK} />
        </MarkOption>
        <MarkOption name="Knot" tag="02">
          <MarkKnot size={84} color={INK} />
        </MarkOption>
        <MarkOption name="Wave F" tag="03">
          <MarkWaveF size={84} color={INK} accent={CORAL} />
        </MarkOption>
        <MarkOption name="Stack" tag="04">
          <MarkStack size={84} color={INK} accent={CORAL} />
        </MarkOption>
        <MarkOption name="Curl" tag="05">
          <MarkCurl size={84} color={INK} />
        </MarkOption>
        <MarkOption name="Notch" tag="06">
          <MarkNotch size={84} color={INK} accent={PAPER} />
        </MarkOption>
      </div>

      {/* Application strip: favicon · dock · inverted · coral · mono */}
      <div style={{ display:'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        <AppContext label="16px favicon" bg="#FFFFFF">
          <MarkResolve size={16} color={INK} />
        </AppContext>
        <AppContext label="App icon · coral" bg={CORAL} radius={22}>
          <MarkResolve size={84} color={PAPER} />
        </AppContext>
        <AppContext label="App icon · ink" bg={INK} radius={22}>
          <MarkResolve size={84} color={PAPER} />
        </AppContext>
        <AppContext label="App icon · paper" bg={PAPER_DEEP} radius={22}>
          <MarkResolve size={84} color={INK} />
        </AppContext>
        <AppContext label="Menu bar" bg="#FFFFFF">
          <MarkResolve size={28} color={INK} />
        </AppContext>
      </div>
    </div>
  );
}

function MarkOption({ name, tag, children, recommended }) {
  return (
    <div style={{
      background: '#FFFFFF', borderRadius: 12,
      border: recommended ? `1.5px solid ${CORAL}` : `1px solid ${RULE}`,
      padding: '18px 12px 12px',
      display:'flex', flexDirection:'column', alignItems:'center', gap: 12,
      position:'relative',
    }}>
      <div className="mono" style={{
        position:'absolute', top: 8, left: 10, fontSize: 9,
        color: MUTE, letterSpacing: '0.12em',
      }}>{tag}</div>
      {recommended && (
        <div style={{
          position:'absolute', top: 8, right: 10,
          width: 6, height: 6, borderRadius: '50%', background: CORAL,
        }} />
      )}
      <div style={{ flex: 1, display:'flex', alignItems:'center', justifyContent:'center', height: 96 }}>
        {children}
      </div>
      <div style={{
        fontSize: 12, fontWeight: 600, color: INK,
        borderTop: `1px solid ${RULE}`, width: '100%', paddingTop: 8, textAlign:'center',
      }}>{name}</div>
    </div>
  );
}

function AppContext({ label, bg, radius, children }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap: 8 }}>
      <div style={{
        background: bg, borderRadius: radius || 10,
        border: bg === '#FFFFFF' || bg === PAPER_DEEP ? `1px solid ${RULE}` : 'none',
        height: 96, display:'flex', alignItems:'center', justifyContent:'center',
      }}>
        {children}
      </div>
      <div className="mono" style={{ fontSize: 10, color: MUTE, letterSpacing: '0.06em', textAlign:'center' }}>
        {label}
      </div>
    </div>
  );
}

function Variation({ label, children, bg }) {
  return (
    <div style={{
      background: bg || '#FFFFFF', borderRadius: 14,
      padding: '24px 18px 16px',
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14,
      border: bg ? 'none' : `1px solid ${RULE}`,
    }}>
      <div style={{ flex: 1, display:'flex', alignItems:'center', justifyContent:'center', minHeight: 110 }}>
        {children}
      </div>
      <div style={{ fontSize: 11, color: MUTE, letterSpacing: '0.08em', textTransform:'uppercase' }}>{label}</div>
    </div>
  );
}

function Eyebrow({ text }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 24, height: 2, background: CORAL }} />
      <div className="mono" style={{ fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: INK_SOFT }}>
        {text}
      </div>
    </div>
  );
}

// =================== PALETTE CARD ===================
function PaletteCard() {
  const swatches = [
    { name: 'Paper',   hex: PAPER,      role: 'Surface — default background', fg: INK },
    { name: 'Paper Deep', hex: PAPER_DEEP, role: 'Inset surface',              fg: INK },
    { name: 'Ink',     hex: INK,        role: 'Text, marks',                  fg: PAPER },
    { name: 'Coral',   hex: CORAL,      role: 'Accent — listening, focus',    fg: PAPER },
    { name: 'Sage',    hex: SAGE,       role: 'Secondary — success, status',  fg: PAPER },
    { name: 'Butter',  hex: BUTTER,     role: 'Tertiary — playful pop',       fg: INK },
  ];
  return (
    <div style={{
      width: 1100, height: 700, background: PAPER,
      padding: 56, boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', gap: 32,
    }}>
      <Eyebrow text="02 — Color" />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, flex: 1 }}>
        {swatches.map(s => (
          <div key={s.name} style={{
            background: s.hex, color: s.fg, borderRadius: 14,
            padding: 22, display:'flex', flexDirection:'column', justifyContent:'space-between',
            border: s.name.startsWith('Paper') ? `1px solid ${RULE}` : 'none',
            minHeight: 0,
          }}>
            <div className="display" style={{ fontSize: 40, fontWeight: 600, fontVariationSettings: `'wdth' 85` }}>
              {s.name}
            </div>
            <div>
              <div style={{ fontSize: 13, opacity: 0.85, marginBottom: 6, lineHeight: 1.35 }}>{s.role}</div>
              <div className="mono" style={{ fontSize: 12, opacity: 0.7 }}>{s.hex}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 20, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 13, color: MUTE, maxWidth: 520, lineHeight: 1.5 }}>
          Cream paper and warm ink do the heavy lifting. Coral is the one voice that talks back — used only for state changes that matter (listening, active, action). Sage and Butter are quiet supporting players.
        </div>
        <Ratios />
      </div>
    </div>
  );
}

function Ratios() {
  // a simple bar showing 70 / 20 / 7 / 3 usage
  const bars = [
    { c: PAPER, w: 64, l: 'Paper' },
    { c: INK, w: 18, l: 'Ink' },
    { c: CORAL, w: 10, l: 'Coral' },
    { c: SAGE, w: 5, l: 'Sage' },
    { c: BUTTER, w: 3, l: 'Butter' },
  ];
  return (
    <div style={{ width: 340 }}>
      <div style={{ display:'flex', height: 28, borderRadius: 6, overflow: 'hidden', border: `1px solid ${RULE}` }}>
        {bars.map((b, i) => <div key={i} style={{ flex: b.w, background: b.c }} />)}
      </div>
      <div className="mono" style={{ fontSize: 10, color: MUTE, marginTop: 6, letterSpacing:'0.06em' }}>USAGE RATIO</div>
    </div>
  );
}

// =================== TYPE CARD ===================
function TypeCard() {
  return (
    <div style={{
      width: 1100, height: 700, background: PAPER,
      padding: 56, boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', gap: 28,
    }}>
      <Eyebrow text="03 — Type" />

      <div className="display" style={{ fontSize: 168, fontWeight: 700, color: INK, fontVariationSettings: `'wdth' 85, 'opsz' 96`, lineHeight: 0.85, letterSpacing: '-0.035em' }}>
        Speak. <span style={{ fontStyle:'italic', fontWeight: 500, color: CORAL, fontVariationSettings: `'wdth' 100` }}>Land.</span>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 36, marginTop: 'auto' }}>
        <TypeSpec
          name="Bricolage Grotesque"
          role="Display — headlines, wordmark, big numbers"
          sample="Hold to talk."
          sampleStyle={{ fontFamily: 'Bricolage Grotesque', fontSize: 48, fontWeight: 700, fontVariationSettings: `'wdth' 85, 'opsz' 72`, letterSpacing:'-0.025em' }}
          axes={['Weight 300–800', 'Width 75–100', 'Optical 12–96']}
        />
        <TypeSpec
          name="Inter Tight"
          role="Body — UI, paragraphs, captions"
          sample="The cursor is wherever you left it."
          sampleStyle={{ fontFamily: 'Inter Tight', fontSize: 22, fontWeight: 450, letterSpacing:'-0.012em', color: INK_SOFT }}
          axes={['Weight 300–800', 'Italic']}
        />
      </div>
    </div>
  );
}

function TypeSpec({ name, role, sample, sampleStyle, axes }) {
  return (
    <div style={{ borderTop: `1px solid ${RULE}`, paddingTop: 18, display:'flex', flexDirection:'column', gap: 14 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
        <div className="display" style={{ fontSize: 22, fontWeight: 600, fontVariationSettings: `'wdth' 90` }}>{name}</div>
        <div className="mono" style={{ fontSize: 11, color: MUTE, letterSpacing:'0.08em', textTransform:'uppercase' }}>{role}</div>
      </div>
      <div style={sampleStyle}>{sample}</div>
      <div style={{ display:'flex', gap: 8, flexWrap:'wrap' }}>
        {axes.map(a => (
          <span key={a} className="mono" style={{
            fontSize: 10, padding: '4px 9px', background: PAPER_DEEP,
            color: INK_SOFT, borderRadius: 999, letterSpacing:'0.04em',
          }}>{a}</span>
        ))}
      </div>
    </div>
  );
}

// =================== ILLUSTRATION CARD ===================
function IllustrationCard() {
  return (
    <div style={{
      width: 1100, height: 700, background: PAPER,
      padding: 56, boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', gap: 24,
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <Eyebrow text="04 — Marks" />
        <div style={{ fontSize: 13, color: MUTE, maxWidth: 420, textAlign:'right', lineHeight: 1.5 }}>
          The art is single-stroke shorthand for speech — squiggles, loops, dots, bars. Drawn loosely, never literal. One ink line at a time.
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        gridTemplateRows: '1fr 1fr',
        gap: 16, flex: 1,
      }}>
        <MarkTile label="Voice line" caption="The hero motif. Used as divider, accent, and signature.">
          <Squiggle width={300} height={64} stroke={INK} weight={4} />
        </MarkTile>

        <MarkTile label="Loop" caption="A single cursive curl. Tail of the wordmark, end of a sentence.">
          <LoopMark size={140} stroke={INK} weight={5} />
        </MarkTile>

        <MarkTile label="Burst" caption="Voice exits the mic. State badge for active recording.">
          <Burst size={84} stroke={CORAL} weight={3} />
        </MarkTile>

        <MarkTile label="Quote curls" caption="Opening and closing — used to set off a transcript.">
          <QuoteCurls size={120} stroke={INK} color2={CORAL} weight={5} />
        </MarkTile>

        <MarkTile label="Dot rhythm" caption="Beat of the cursor. Loading, listening, idle.">
          <DotLine count={9} gap={22} dot={8} color={INK} accent={CORAL} accentIdx={4} />
        </MarkTile>

        <MarkTile label="Voice bars" caption="Live levels. Animated during recording, rests at idle.">
          <VoiceBars count={16} width={240} height={56} color={INK} accent={CORAL} />
        </MarkTile>
      </div>
    </div>
  );
}

function MarkTile({ label, caption, children }) {
  return (
    <div style={{
      background: '#FFFFFF', borderRadius: 14, border: `1px solid ${RULE}`,
      padding: 18, display:'flex', flexDirection:'column',
    }}>
      <div style={{ flex: 1, display:'flex', alignItems:'center', justifyContent:'center', minHeight: 0 }}>
        {children}
      </div>
      <div style={{ borderTop: `1px solid ${RULE}`, paddingTop: 12, marginTop: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: INK, marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 12, color: MUTE, lineHeight: 1.45 }}>{caption}</div>
      </div>
    </div>
  );
}

Object.assign(window, {
  PAPER, PAPER_DEEP, INK, INK_SOFT, MUTE, RULE, CORAL, CORAL_SOFT, SAGE, SAGE_SOFT, BUTTER,
  LogoCard, PaletteCard, TypeCard, IllustrationCard, Eyebrow,
});
