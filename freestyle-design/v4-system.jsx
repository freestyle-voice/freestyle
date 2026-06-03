// Freestyle — Studio brand system cards: logo, palette, type, motifs.

// =================== LOGO CARD ===================
function V4LogoCard() {
  return (
    <div style={{
      width: 1100, height: 700, background: V4.CANVAS,
      padding: 48, boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', gap: 22,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position:'absolute', top: 18, left: 18 }}><Crosshair4 /></div>
      <div style={{ position:'absolute', top: 18, right: 18 }}><Crosshair4 /></div>
      <div style={{ position:'absolute', bottom: 18, left: 18 }}><Crosshair4 /></div>
      <div style={{ position:'absolute', bottom: 18, right: 18 }}><Crosshair4 /></div>

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <V4Eyebrow text="01 — Identity" />
        <div style={{ fontSize: 12.5, color: V4.INK_SOFT, maxWidth: 380, textAlign:'right', lineHeight: 1.5 }}>
          Six marks explored. <strong style={{ color: V4.OLIVE }}>Wave</strong> is recommended —
          a single sound-wave line, amplitude tapering in and out like a spoken word.
        </div>
      </div>

      {/* Hero */}
      <div style={{
        background: V4.ELEVATED, borderRadius: 16, padding: '40px 44px',
        border: `1px solid ${V4.RULE}`,
        display:'flex', alignItems:'center', justifyContent:'space-between', gap: 32,
        position:'relative', overflow:'hidden',
      }}>
        <div style={{ position:'absolute', inset: 0, opacity: 0.07, display:'flex', alignItems:'center' }}>
          <ScopeTrace4 width={1100} height={140} weight={1.2} cycles={5} opacity={0.5} />
        </div>
        <div style={{ display:'flex', alignItems:'center', gap: 32, zIndex: 1 }}>
          <MarkFlourish size={120} color={V4.OLIVE} />
          <V4Wordmark size={92} color={V4.INK} accent={V4.OLIVE} />
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap: 8, textAlign:'right', zIndex: 1 }}>
          <div className="mono" style={{ fontSize: 11, letterSpacing: '0.16em', textTransform:'uppercase', color: V4.OLIVE }}>
            Recommended
          </div>
          <div className="serif" style={{ fontSize: 36, color: V4.INK, lineHeight: 1 }}>Wave</div>
          <div style={{ fontSize: 12.5, color: V4.INK_SOFT, lineHeight: 1.45, maxWidth: 220 }}>
            Voice in motion. One line.
          </div>
        </div>
      </div>

      {/* Mark grid */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(6, 1fr)', gap: 10 }}>
        <V4MarkTile name="Wave"     tag="01" recommended><MarkFlourish size={56} /></V4MarkTile>
        <V4MarkTile name="Loop"     tag="02"><MarkLoop size={56} /></V4MarkTile>
        <V4MarkTile name="Glide"    tag="03"><MarkGlide size={56} /></V4MarkTile>
        <V4MarkTile name="Curl"     tag="04"><MarkCurl size={56} /></V4MarkTile>
        <V4MarkTile name="Knot"     tag="05"><MarkKnot size={56} /></V4MarkTile>
        <V4MarkTile name="Swash"    tag="06"><MarkSwash size={56} /></V4MarkTile>
      </div>

      {/* Construction — "single gesture" diagram instead of a grid */}
      <div style={{
        background: V4.ELEVATED, border: `1px solid ${V4.RULE}`, borderRadius: 14,
        padding: 22, display:'flex', alignItems:'center', gap: 36,
      }}>
        <div style={{ display:'flex', flexDirection:'column', gap: 6, minWidth: 200 }}>
          <div className="mono" style={{ fontSize: 10, letterSpacing: '0.16em', textTransform:'uppercase', color: V4.MUTE }}>
            One line · sine envelope
          </div>
          <div style={{ fontSize: 13.5, color: V4.INK_SOFT, lineHeight: 1.45 }}>
            2½ oscillations, amplitude tapered by a sine envelope so the wave fades in and out. Round caps, even weight throughout.
          </div>
        </div>

        {/* The single gesture: just the mark, big and centered, on a soft grid */}
        <div style={{ width: 200, height: 140, position: 'relative', flexShrink: 0 }}>
          <svg width="200" height="140" style={{ position:'absolute', inset: 0 }}>
            <line x1="0" y1="70" x2="200" y2="70" stroke={V4.RULE} strokeWidth="1" strokeDasharray="2 3" />
          </svg>
          <div style={{ position:'absolute', inset: 0, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <MarkFlourish size={180} color={V4.OLIVE} weight={9} />
          </div>
        </div>

        <div style={{ flex: 1, display:'flex', alignItems:'baseline', justifyContent:'space-around', gap: 22 }}>
          {[16, 24, 40, 64].map(s => (
            <div key={s} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap: 10 }}>
              <MarkFlourish size={s} />
              <span className="mono" style={{ fontSize: 10, color: V4.MUTE, letterSpacing: '0.06em' }}>{s}px</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function V4MarkTile({ children, name, tag, recommended }) {
  return (
    <div style={{
      background: recommended ? V4.OLIVE_SOFT : V4.ELEVATED,
      border: `1px solid ${recommended ? V4.OLIVE : V4.RULE}`,
      borderRadius: 12, padding: 16,
      display:'flex', flexDirection:'column', alignItems:'center', gap: 10,
      position: 'relative',
    }}>
      <div style={{
        position:'absolute', top: 8, left: 10,
        fontSize: 9, fontFamily: 'JetBrains Mono', color: V4.MUTE, letterSpacing:'0.1em',
      }}>{tag}</div>
      {recommended && (
        <div style={{
          position:'absolute', top: 8, right: 10,
          width: 5, height: 5, borderRadius: '50%', background: V4.OLIVE,
        }} />
      )}
      <div style={{ height: 56, display:'flex', alignItems:'center', justifyContent:'center', marginTop: 8 }}>
        {children}
      </div>
      <div style={{ fontSize: 12, color: V4.INK, fontWeight: 500 }}>{name}</div>
    </div>
  );
}

// =================== PALETTE CARD ===================
function V4PaletteCard() {
  const surfaces = [
    { name: 'Canvas',   hex: V4.CANVAS,   use: 'Page background' },
    { name: 'Paper',    hex: V4.PAPER,    use: 'Sidebar, sections' },
    { name: 'Elevated', hex: V4.ELEVATED, use: 'Cards, surfaces' },
    { name: 'Rule',     hex: V4.RULE,     use: 'Hairlines, dividers' },
  ];
  const inks = [
    { name: 'Ink',      hex: V4.INK,      use: 'Headlines, body' },
    { name: 'Ink soft', hex: V4.INK_SOFT, use: 'Secondary copy' },
    { name: 'Mute',     hex: V4.MUTE,     use: 'Labels, axes' },
  ];
  return (
    <div style={{
      width: 1100, height: 700, background: V4.CANVAS,
      padding: 48, boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', gap: 22, position: 'relative',
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <V4Eyebrow text="02 — Color" />
        <div style={{ fontSize: 12.5, color: V4.INK_SOFT, maxWidth: 460, textAlign:'right', lineHeight: 1.5 }}>
          Warm paper, deep ink, one olive. Olive is the only system accent — when you see it, something is alive.
        </div>
      </div>

      {/* Olive hero */}
      <div style={{
        background: V4.OLIVE, borderRadius: 16, padding: '36px 40px',
        display:'flex', alignItems:'flex-end', justifyContent:'space-between',
        minHeight: 170,
      }}>
        <div>
          <div className="mono" style={{ fontSize: 10.5, letterSpacing:'0.16em', textTransform:'uppercase', color: V4.CANVAS, opacity: 0.7 }}>
            State color · the only accent in the system
          </div>
          <div className="serif-italic" style={{ fontSize: 92, color: V4.CANVAS, lineHeight: 0.95, marginTop: 6 }}>
            Olive
          </div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap: 4, alignItems:'flex-end' }}>
          <span className="mono" style={{ fontSize: 11, color: V4.CANVAS, opacity: 0.7 }}>#6B8F12</span>
          <span className="mono" style={{ fontSize: 11, color: V4.CANVAS, opacity: 0.7 }}>oklch 0.62 .15 117</span>
          <span className="mono" style={{ fontSize: 11, color: V4.CANVAS, opacity: 0.7 }}>rgb(107 143 18)</span>
        </div>
      </div>

      {/* Surfaces row */}
      <div>
        <div className="mono" style={{ fontSize: 10, letterSpacing:'0.16em', textTransform:'uppercase', color: V4.MUTE, marginBottom: 10 }}>Surfaces</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap: 10 }}>
          {surfaces.map(s => (
            <div key={s.name} style={{
              background: s.hex, height: 96, borderRadius: 12,
              border: `1px solid ${V4.RULE}`, padding: 14,
              display:'flex', flexDirection:'column', justifyContent:'space-between',
            }}>
              <div style={{ fontSize: 13, color: V4.INK, fontWeight: 500 }}>{s.name}</div>
              <div>
                <div className="mono" style={{ fontSize: 10, color: V4.INK_SOFT }}>{s.hex}</div>
                <div style={{ fontSize: 11, color: V4.MUTE, marginTop: 2 }}>{s.use}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Inks row */}
      <div>
        <div className="mono" style={{ fontSize: 10, letterSpacing:'0.16em', textTransform:'uppercase', color: V4.MUTE, marginBottom: 10 }}>Inks & secondary</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap: 10 }}>
          {inks.map(s => (
            <div key={s.name} style={{
              background: V4.ELEVATED, height: 96, borderRadius: 12,
              border: `1px solid ${V4.RULE}`, padding: 14,
              display:'flex', flexDirection:'column', justifyContent:'space-between',
            }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: s.hex, border: `1px solid ${V4.RULE}` }} />
              <div>
                <div style={{ fontSize: 12.5, color: V4.INK }}>{s.name}</div>
                <div className="mono" style={{ fontSize: 10, color: V4.MUTE }}>{s.hex}</div>
              </div>
            </div>
          ))}
          <div style={{
            background: V4.ELEVATED, height: 96, borderRadius: 12,
            border: `1px solid ${V4.RULE}`, padding: 14,
            display:'flex', flexDirection:'column', justifyContent:'space-between',
          }}>
            <div style={{ display:'flex', gap: 6 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: V4.BLUSH }} />
              <div style={{ width: 28, height: 28, borderRadius: 8, background: V4.PLUM }} />
            </div>
            <div>
              <div style={{ fontSize: 12.5, color: V4.INK }}>Blush · Plum</div>
              <div className="mono" style={{ fontSize: 10, color: V4.MUTE }}>Destructive · meta</div>
            </div>
          </div>
          <div style={{
            background: 'transparent', border: `1px dashed ${V4.RULE}`,
            height: 96, borderRadius: 12, padding: 14,
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize: 11, color: V4.MUTE, lineHeight: 1.4, textAlign:'center',
          }}>
            No other<br/>system color
          </div>
        </div>
      </div>
    </div>
  );
}

// =================== TYPE CARD ===================
function V4TypeCard() {
  return (
    <div style={{
      width: 1100, height: 700, background: V4.CANVAS,
      padding: 48, boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', gap: 16, position: 'relative',
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <V4Eyebrow text="03 — Type" />
        <div style={{ fontSize: 12.5, color: V4.INK_SOFT, maxWidth: 420, textAlign:'right', lineHeight: 1.5 }}>
          A hot italic serif for voice moments. A neutral grotesque for everything else. Mono for technical labels.
        </div>
      </div>

      <div style={{
        background: V4.ELEVATED, borderRadius: 16, padding: '32px 40px',
        border: `1px solid ${V4.RULE}`,
        display:'grid', gridTemplateColumns: '170px 1fr', gap: 28, alignItems:'center',
      }}>
        <div>
          <div className="mono" style={{ fontSize: 10, color: V4.OLIVE, letterSpacing:'0.14em', textTransform:'uppercase' }}>Display</div>
          <div style={{ fontSize: 14, color: V4.INK, marginTop: 6, fontWeight: 500 }}>Instrument Serif</div>
          <div style={{ fontSize: 11.5, color: V4.MUTE, marginTop: 4, lineHeight: 1.5 }}>
            Italic, high-contrast. Voice headlines, brand moments, pull quotes.
          </div>
        </div>
        <div>
          <div className="serif-italic" style={{ fontSize: 110, color: V4.INK, lineHeight: 0.9, letterSpacing: '-0.01em' }}>
            Speak <span style={{ color: V4.OLIVE }}>freely.</span>
          </div>
        </div>
      </div>

      <div style={{
        background: V4.ELEVATED, borderRadius: 16, padding: '24px 40px',
        border: `1px solid ${V4.RULE}`,
        display:'grid', gridTemplateColumns: '170px 1fr', gap: 28, alignItems:'center',
      }}>
        <div>
          <div className="mono" style={{ fontSize: 10, color: V4.OLIVE, letterSpacing:'0.14em', textTransform:'uppercase' }}>UI / Body</div>
          <div style={{ fontSize: 14, color: V4.INK, marginTop: 6, fontWeight: 500 }}>DM Sans</div>
          <div style={{ fontSize: 11.5, color: V4.MUTE, marginTop: 4, lineHeight: 1.5 }}>
            300 / 450 / 600. Tight on UI, generous on long-form.
          </div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap: 8 }}>
          <div style={{ fontSize: 32, color: V4.INK, fontWeight: 500, letterSpacing:'-0.018em', lineHeight: 1.1 }}>
            The cursor doesn't have to be here.
          </div>
          <div style={{ fontSize: 15, color: V4.INK_SOFT, lineHeight: 1.5 }}>
            Hold the globe key in any app — Slack, Notes, the URL bar — and Freestyle pastes at your cursor when you release.
          </div>
        </div>
      </div>

      <div style={{
        background: V4.ELEVATED, borderRadius: 16, padding: '22px 40px',
        border: `1px solid ${V4.RULE}`,
        display:'grid', gridTemplateColumns: '170px 1fr', gap: 28, alignItems:'center',
      }}>
        <div>
          <div className="mono" style={{ fontSize: 10, color: V4.OLIVE, letterSpacing:'0.14em', textTransform:'uppercase' }}>Mono</div>
          <div style={{ fontSize: 14, color: V4.INK, marginTop: 6, fontWeight: 500 }}>JetBrains Mono</div>
          <div style={{ fontSize: 11.5, color: V4.MUTE, marginTop: 4, lineHeight: 1.5 }}>
            Timecodes, hotkeys, model names, status.
          </div>
        </div>
        <div className="mono" style={{ display:'flex', flexDirection:'column', gap: 6 }}>
          <div style={{ fontSize: 13, color: V4.INK_SOFT, letterSpacing:'0.04em' }}>0:04.18 · WHISPER.BASE.EN · 14 WORDS</div>
          <div style={{ fontSize: 13, color: V4.MUTE, letterSpacing:'0.04em' }}>hold <span style={{ color: V4.OLIVE, fontWeight: 600 }}>fn</span> · release to paste</div>
        </div>
      </div>
    </div>
  );
}

// =================== MOTIFS CARD ===================
function V4MotifsCard() {
  return (
    <div style={{
      width: 1100, height: 700, background: V4.CANVAS,
      padding: 48, boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', gap: 22, position: 'relative',
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <V4Eyebrow text="04 — Motifs" />
        <div style={{ fontSize: 12.5, color: V4.INK_SOFT, maxWidth: 460, textAlign:'right', lineHeight: 1.5 }}>
          Three families. Use one per surface — never combine trace with bars in the same composition.
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, flex: 1 }}>
        <V4MotifSlot label="A · Scope trace" desc="Continuous signal. Masthead, brand poster, backgrounds.">
          <ScopeTrace4 width={300} height={120} cycles={3.5} weight={1.6} />
        </V4MotifSlot>
        <V4MotifSlot label="B · Voice bars" desc="Live levels. Pill, recording states, micro-feedback.">
          <VoiceBars4 count={20} width={260} height={80} animated />
        </V4MotifSlot>
        <V4MotifSlot label="C · Pulse ring" desc="Room tone. Empty states, completion echoes.">
          <PulseRing4 size={140} count={4} />
        </V4MotifSlot>
      </div>

      <div style={{
        background: V4.ELEVATED, border: `1px solid ${V4.RULE}`, borderRadius: 14,
        padding: '22px 28px', display:'flex', alignItems:'center', gap: 28,
      }}>
        <div style={{ flexShrink: 0 }}>
          <div className="mono" style={{ fontSize: 10, color: V4.MUTE, letterSpacing:'0.16em', textTransform:'uppercase' }}>Voice quote</div>
          <div style={{ fontSize: 12.5, color: V4.INK_SOFT, lineHeight: 1.5, marginTop: 6, maxWidth: 180 }}>
            Transcripts always set in italic serif. Never in body sans.
          </div>
        </div>
        <div style={{ width: 1, alignSelf:'stretch', background: V4.RULE }} />
        <div className="serif-italic" style={{ fontSize: 28, color: V4.INK, lineHeight: 1.3, flex: 1 }}>
          “Could you push the meeting from two to three? Actually, let's make it tomorrow at ten.”
        </div>
      </div>
    </div>
  );
}

function V4MotifSlot({ label, desc, children }) {
  return (
    <div style={{
      background: V4.ELEVATED, border: `1px solid ${V4.RULE}`, borderRadius: 14,
      padding: 22, display:'flex', flexDirection:'column', gap: 14,
    }}>
      <div className="mono" style={{ fontSize: 10, color: V4.OLIVE, letterSpacing:'0.16em', textTransform:'uppercase' }}>{label}</div>
      <div style={{ flex: 1, display:'flex', alignItems:'center', justifyContent:'center' }}>
        {children}
      </div>
      <div style={{ fontSize: 12.5, color: V4.INK_SOFT, lineHeight: 1.5 }}>{desc}</div>
    </div>
  );
}

Object.assign(window, {
  V4LogoCard, V4PaletteCard, V4TypeCard, V4MotifsCard,
});
