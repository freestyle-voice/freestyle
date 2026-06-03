// Freestyle — After Hours brand system cards: logo, palette, type, marks.

// =================== LOGO CARD ===================
function V2LogoCard() {
  return (
    <div style={{
      width: 1100, height: 700, background: V2.VOID,
      padding: 48, boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', gap: 22,
      position: 'relative', overflow: 'hidden',
    }}>
      {/* corner crosshairs */}
      <div style={{ position:'absolute', top: 18, left: 18 }}><Crosshair /></div>
      <div style={{ position:'absolute', top: 18, right: 18 }}><Crosshair /></div>
      <div style={{ position:'absolute', bottom: 18, left: 18 }}><Crosshair /></div>
      <div style={{ position:'absolute', bottom: 18, right: 18 }}><Crosshair /></div>

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <V2Eyebrow text="01 — Identity" />
        <div style={{ fontSize: 12.5, color: V2.TEXT_SOFT, maxWidth: 380, textAlign:'right', lineHeight: 1.5 }}>
          Six marks explored. <span style={{ color: V2.LIME }}>Slash</span> is recommended —
          a single glowing thread that reads as cursor, waveform, and motion in one stroke.
        </div>
      </div>

      {/* Hero: chosen mark + wordmark */}
      <div style={{
        background: V2.INK, borderRadius: 16, padding: '40px 44px',
        border: `1px solid ${V2.RULE}`,
        display:'flex', alignItems:'center', justifyContent:'space-between', gap: 32,
        position:'relative', overflow:'hidden',
      }}>
        {/* faint scope trace behind */}
        <div style={{ position:'absolute', inset: 0, opacity: 0.35, display:'flex', alignItems:'center' }}>
          <ScopeTrace width={1100} height={140} color={V2.LIME} weight={1.2} cycles={5} glow={false} opacity={0.4} />
        </div>
        <div style={{ display:'flex', alignItems:'center', gap: 24, zIndex: 1 }}>
          <MarkSlash size={120} color={V2.LIME} />
          <V2Wordmark size={92} color={V2.TEXT} accent={V2.LIME} />
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap: 8, textAlign:'right', zIndex: 1 }}>
          <div className="mono" style={{ fontSize: 11, letterSpacing: '0.16em', textTransform:'uppercase', color: V2.LIME }}>
            Recommended
          </div>
          <div className="serif" style={{ fontSize: 36, color: V2.TEXT, lineHeight: 1 }}>
            Slash
          </div>
          <div style={{ fontSize: 12.5, color: V2.TEXT_SOFT, lineHeight: 1.45, maxWidth: 220 }}>
            One glowing thread. Cursor, waveform, motion.
          </div>
        </div>
      </div>

      {/* 6-mark exploration grid */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(6, 1fr)', gap: 10 }}>
        <V2MarkTile name="Slash"  tag="01" recommended><MarkSlash size={64} /></V2MarkTile>
        <V2MarkTile name="Caret"  tag="02"><MarkCaret size={64} /></V2MarkTile>
        <V2MarkTile name="Pulse"  tag="03"><MarkPulse size={64} /></V2MarkTile>
        <V2MarkTile name="Aurora" tag="04"><MarkAurora size={64} /></V2MarkTile>
        <V2MarkTile name="Listen" tag="05"><MarkListen size={64} /></V2MarkTile>
        <V2MarkTile name="Spark"  tag="06"><MarkSpark size={64} /></V2MarkTile>
      </div>

      {/* Construction strip */}
      <div style={{
        background: V2.SURFACE, border: `1px solid ${V2.RULE}`, borderRadius: 14,
        padding: 22, display:'flex', alignItems:'center', gap: 36,
      }}>
        <div style={{ display:'flex', flexDirection:'column', gap: 6, minWidth: 180 }}>
          <div className="mono" style={{ fontSize: 10, letterSpacing: '0.16em', textTransform:'uppercase', color: V2.MUTE }}>
            Construction
          </div>
          <div style={{ fontSize: 13.5, color: V2.TEXT_SOFT, lineHeight: 1.45 }}>
            Stroke width = 16% of unit. End caps round. 30° lean off vertical — same angle as an italic <span className="serif-italic" style={{ color: V2.LIME }}>i</span>.
          </div>
        </div>
        {/* Construction diagram */}
        <div style={{ width: 140, height: 140, position: 'relative', flexShrink: 0 }}>
          {/* grid */}
          <svg width="140" height="140" style={{ position:'absolute', inset: 0 }}>
            <rect x="0" y="0" width="140" height="140" fill="none" stroke={V2.RULE} strokeWidth="1" />
            {[0.25, 0.5, 0.75].map(t => (
              <g key={t}>
                <line x1={t*140} y1="0" x2={t*140} y2="140" stroke={V2.RULE_SOFT} strokeWidth="1" />
                <line x1="0" y1={t*140} x2="140" y2={t*140} stroke={V2.RULE_SOFT} strokeWidth="1" />
              </g>
            ))}
          </svg>
          <div style={{ position:'absolute', inset: 0, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <MarkSlash size={100} />
          </div>
        </div>
        {/* Sizes */}
        <div style={{ flex: 1, display:'flex', alignItems:'baseline', justifyContent:'space-around', gap: 22 }}>
          {[16, 24, 40, 64].map(s => (
            <div key={s} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap: 10 }}>
              <MarkSlash size={s} glow={s >= 24} />
              <span className="mono" style={{ fontSize: 10, color: V2.MUTE, letterSpacing: '0.06em' }}>{s}px</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function V2MarkTile({ children, name, tag, recommended }) {
  return (
    <div style={{
      background: recommended ? V2.SURFACE2 : V2.SURFACE,
      border: `1px solid ${recommended ? V2.LIME_DEEP : V2.RULE}`,
      borderRadius: 12, padding: 16,
      display:'flex', flexDirection:'column', alignItems:'center', gap: 10,
      position: 'relative',
    }}>
      <div style={{
        position:'absolute', top: 8, left: 10,
        fontSize: 9, fontFamily: 'JetBrains Mono', color: V2.MUTE, letterSpacing:'0.1em',
      }}>{tag}</div>
      {recommended && (
        <div style={{
          position:'absolute', top: 8, right: 10,
          width: 5, height: 5, borderRadius: '50%', background: V2.LIME,
          boxShadow: `0 0 6px ${V2.LIME}`,
        }} />
      )}
      <div style={{ height: 64, display:'flex', alignItems:'center', justifyContent:'center', marginTop: 8 }}>
        {children}
      </div>
      <div style={{ fontSize: 12, color: V2.TEXT, fontWeight: 500 }}>{name}</div>
    </div>
  );
}

// =================== PALETTE CARD ===================
function V2PaletteCard() {
  const surfaces = [
    { name: 'Void',     hex: V2.VOID,     oklch: 'oklch(0.10 0.01 260)', use: 'Page background' },
    { name: 'Ink',      hex: V2.INK,      oklch: 'oklch(0.16 0.01 260)', use: 'Panels, chrome' },
    { name: 'Surface',  hex: V2.SURFACE,  oklch: 'oklch(0.20 0.01 260)', use: 'Card body' },
    { name: 'Surface 2',hex: V2.SURFACE2, oklch: 'oklch(0.25 0.01 260)', use: 'Elevated' },
  ];
  const inks = [
    { name: 'Text',     hex: V2.TEXT,     oklch: 'oklch(0.91 0.012 80)',  use: 'Body, headlines' },
    { name: 'Text soft',hex: V2.TEXT_SOFT,oklch: 'oklch(0.73 0.014 80)', use: 'Secondary copy' },
    { name: 'Mute',     hex: V2.MUTE,     oklch: 'oklch(0.45 0.012 80)', use: 'Labels, axes' },
  ];
  return (
    <div style={{
      width: 1100, height: 700, background: V2.VOID,
      padding: 48, boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', gap: 24, position: 'relative',
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <V2Eyebrow text="02 — Color" />
        <div style={{ fontSize: 12.5, color: V2.TEXT_SOFT, maxWidth: 460, textAlign:'right', lineHeight: 1.5 }}>
          Nine swatches. Layered cool-blacks for depth, warm cream for humanity, one electric chartreuse that <em>only</em> appears when the mic is open.
        </div>
      </div>

      {/* Hero accent block */}
      <div style={{
        background: V2.LIME, borderRadius: 16, padding: '32px 36px',
        display:'flex', alignItems:'flex-end', justifyContent:'space-between',
        boxShadow: `0 0 80px ${V2.LIME}22`, position: 'relative', overflow: 'hidden', minHeight: 140,
      }}>
        <div>
          <div style={{ fontFamily:'JetBrains Mono', fontSize: 11, letterSpacing:'0.16em', textTransform:'uppercase', color: V2.VOID, opacity: 0.65 }}>
            State color · only one in the system
          </div>
          <div className="serif-italic" style={{ fontSize: 88, color: V2.VOID, lineHeight: 0.9, marginTop: 4 }}>
            Chartreuse
          </div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap: 4 }}>
          <span className="mono" style={{ fontSize: 12, color: V2.VOID, opacity: 0.7 }}>#D8FF3D</span>
          <span className="mono" style={{ fontSize: 12, color: V2.VOID, opacity: 0.7 }}>oklch(0.96 0.22 117)</span>
          <span className="mono" style={{ fontSize: 12, color: V2.VOID, opacity: 0.7 }}>rgb(216 255 61)</span>
        </div>
      </div>

      {/* Surfaces row */}
      <div>
        <div className="mono" style={{ fontSize: 10, letterSpacing:'0.16em', textTransform:'uppercase', color: V2.MUTE, marginBottom: 10 }}>Surfaces</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap: 10 }}>
          {surfaces.map(s => (
            <div key={s.name} style={{
              background: s.hex, height: 110, borderRadius: 12,
              border: `1px solid ${V2.RULE}`, padding: 14,
              display:'flex', flexDirection:'column', justifyContent:'space-between',
            }}>
              <div style={{ fontSize: 13, color: V2.TEXT, fontWeight: 500 }}>{s.name}</div>
              <div>
                <div className="mono" style={{ fontSize: 10, color: V2.TEXT_SOFT }}>{s.hex}</div>
                <div style={{ fontSize: 11, color: V2.MUTE, marginTop: 2 }}>{s.use}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Inks row */}
      <div>
        <div className="mono" style={{ fontSize: 10, letterSpacing:'0.16em', textTransform:'uppercase', color: V2.MUTE, marginBottom: 10 }}>Inks & accents</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap: 10 }}>
          {inks.map(s => (
            <div key={s.name} style={{
              background: V2.SURFACE, height: 110, borderRadius: 12,
              border: `1px solid ${V2.RULE}`, padding: 14,
              display:'flex', flexDirection:'column', justifyContent:'space-between',
            }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: s.hex, border: `1px solid ${V2.RULE}` }} />
              <div>
                <div style={{ fontSize: 12.5, color: V2.TEXT }}>{s.name}</div>
                <div className="mono" style={{ fontSize: 10, color: V2.MUTE }}>{s.hex}</div>
              </div>
            </div>
          ))}
          {/* secondary accents */}
          <div style={{
            background: V2.SURFACE, height: 110, borderRadius: 12,
            border: `1px solid ${V2.RULE}`, padding: 14,
            display:'flex', flexDirection:'column', justifyContent:'space-between',
          }}>
            <div style={{ display:'flex', gap: 6 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: V2.BLUSH }} />
              <div style={{ width: 30, height: 30, borderRadius: 8, background: V2.PLUM }} />
            </div>
            <div>
              <div style={{ fontSize: 12.5, color: V2.TEXT }}>Blush · Plum</div>
              <div className="mono" style={{ fontSize: 10, color: V2.MUTE }}>Use sparingly</div>
            </div>
          </div>
          <div style={{
            background: 'transparent', border: `1px dashed ${V2.RULE}`,
            height: 110, borderRadius: 12, padding: 14,
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize: 11, color: V2.MUTE, lineHeight: 1.4, textAlign:'center',
          }}>
            No other<br/>system color
          </div>
        </div>
      </div>
    </div>
  );
}

// =================== TYPE CARD ===================
function V2TypeCard() {
  return (
    <div style={{
      width: 1100, height: 700, background: V2.VOID,
      padding: 48, boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', gap: 22, position: 'relative',
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <V2Eyebrow text="03 — Type" />
        <div style={{ fontSize: 12.5, color: V2.TEXT_SOFT, maxWidth: 420, textAlign:'right', lineHeight: 1.5 }}>
          Two tones: a hot italic serif for voice moments, a neutral grotesque for everything else. Mono for technical.
        </div>
      </div>

      {/* Display */}
      <div style={{
        background: V2.INK, borderRadius: 16, padding: '34px 40px',
        border: `1px solid ${V2.RULE}`,
        display:'grid', gridTemplateColumns: '170px 1fr', gap: 28, alignItems:'center',
      }}>
        <div>
          <div className="mono" style={{ fontSize: 10, color: V2.LIME, letterSpacing:'0.14em', textTransform:'uppercase' }}>Display</div>
          <div style={{ fontSize: 14, color: V2.TEXT, marginTop: 6, fontWeight: 500 }}>Instrument Serif</div>
          <div style={{ fontSize: 11.5, color: V2.MUTE, marginTop: 4, lineHeight: 1.5 }}>
            Italic, high-contrast. Voice headlines, brand moments, accent glyphs.
          </div>
        </div>
        <div>
          <div className="serif-italic" style={{ fontSize: 116, color: V2.TEXT, lineHeight: 0.9, letterSpacing: '-0.01em' }}>
            Speak <span style={{ color: V2.LIME }} className="glow-lime">freely.</span>
          </div>
        </div>
      </div>

      {/* UI */}
      <div style={{
        background: V2.INK, borderRadius: 16, padding: '28px 40px',
        border: `1px solid ${V2.RULE}`,
        display:'grid', gridTemplateColumns: '170px 1fr', gap: 28, alignItems:'center',
      }}>
        <div>
          <div className="mono" style={{ fontSize: 10, color: V2.LIME, letterSpacing:'0.14em', textTransform:'uppercase' }}>UI / Body</div>
          <div style={{ fontSize: 14, color: V2.TEXT, marginTop: 6, fontWeight: 500 }}>DM Sans</div>
          <div style={{ fontSize: 11.5, color: V2.MUTE, marginTop: 4, lineHeight: 1.5 }}>
            300 / 450 / 600. Tight tracking on UI text. Generous on long-form.
          </div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap: 8 }}>
          <div style={{ fontSize: 36, color: V2.TEXT, fontWeight: 500, letterSpacing:'-0.018em', lineHeight: 1.1 }}>
            The cursor doesn't have to be here.
          </div>
          <div style={{ fontSize: 16, color: V2.TEXT_SOFT, lineHeight: 1.5, fontWeight: 400 }}>
            Hold the globe key in any app — Slack, Notes, the URL bar — and Freestyle pastes at your cursor when you release.
          </div>
        </div>
      </div>

      {/* Mono */}
      <div style={{
        background: V2.INK, borderRadius: 16, padding: '24px 40px',
        border: `1px solid ${V2.RULE}`,
        display:'grid', gridTemplateColumns: '170px 1fr', gap: 28, alignItems:'center',
      }}>
        <div>
          <div className="mono" style={{ fontSize: 10, color: V2.LIME, letterSpacing:'0.14em', textTransform:'uppercase' }}>Mono</div>
          <div style={{ fontSize: 14, color: V2.TEXT, marginTop: 6, fontWeight: 500 }}>JetBrains Mono</div>
          <div style={{ fontSize: 11.5, color: V2.MUTE, marginTop: 4, lineHeight: 1.5 }}>
            Timecodes, hotkeys, model names, status.
          </div>
        </div>
        <div className="mono" style={{ display:'flex', flexDirection:'column', gap: 6 }}>
          <div style={{ fontSize: 13, color: V2.TEXT_SOFT, letterSpacing:'0.04em' }}>0:04.18 · WHISPER.BASE.EN · 14 WORDS</div>
          <div style={{ fontSize: 13, color: V2.MUTE, letterSpacing:'0.04em' }}>hold <span style={{ color: V2.LIME }}>fn</span> · release to paste</div>
        </div>
      </div>
    </div>
  );
}

// =================== MARKS / MOTIFS CARD ===================
function V2MotifsCard() {
  return (
    <div style={{
      width: 1100, height: 700, background: V2.VOID,
      padding: 48, boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', gap: 22, position: 'relative',
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <V2Eyebrow text="04 — Motifs" />
        <div style={{ fontSize: 12.5, color: V2.TEXT_SOFT, maxWidth: 460, textAlign:'right', lineHeight: 1.5 }}>
          Three families. Use one per surface — never combine the trace with the bars in the same composition.
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, flex: 1 }}>
        {/* Scope trace */}
        <div style={{
          background: V2.INK, border: `1px solid ${V2.RULE}`, borderRadius: 14,
          padding: 22, display:'flex', flexDirection:'column', gap: 14,
        }}>
          <div className="mono" style={{ fontSize: 10, color: V2.LIME, letterSpacing:'0.16em', textTransform:'uppercase' }}>A · Scope trace</div>
          <div style={{ flex: 1, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <ScopeTrace width={300} height={120} cycles={3.5} weight={1.6} />
          </div>
          <div style={{ fontSize: 12.5, color: V2.TEXT_SOFT, lineHeight: 1.5 }}>
            Continuous signal. Heroes, brand poster, backgrounds.
          </div>
        </div>

        {/* Voice bars */}
        <div style={{
          background: V2.INK, border: `1px solid ${V2.RULE}`, borderRadius: 14,
          padding: 22, display:'flex', flexDirection:'column', gap: 14,
        }}>
          <div className="mono" style={{ fontSize: 10, color: V2.LIME, letterSpacing:'0.16em', textTransform:'uppercase' }}>B · Voice bars</div>
          <div style={{ flex: 1, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <VoiceBars count={20} width={260} height={80} animated />
          </div>
          <div style={{ fontSize: 12.5, color: V2.TEXT_SOFT, lineHeight: 1.5 }}>
            Live levels. Pill, recording states, micro-feedback.
          </div>
        </div>

        {/* Pulse ring */}
        <div style={{
          background: V2.INK, border: `1px solid ${V2.RULE}`, borderRadius: 14,
          padding: 22, display:'flex', flexDirection:'column', gap: 14,
        }}>
          <div className="mono" style={{ fontSize: 10, color: V2.LIME, letterSpacing:'0.16em', textTransform:'uppercase' }}>C · Pulse ring</div>
          <div style={{ flex: 1, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <PulseRing size={140} count={4} />
          </div>
          <div style={{ fontSize: 12.5, color: V2.TEXT_SOFT, lineHeight: 1.5 }}>
            Room tone. Empty states, "listening for" prompts, completion echoes.
          </div>
        </div>
      </div>

      {/* Voice quote treatment */}
      <div style={{
        background: V2.INK, border: `1px solid ${V2.RULE}`, borderRadius: 14,
        padding: '24px 28px', display:'flex', alignItems:'center', gap: 28,
      }}>
        <div style={{ flexShrink: 0 }}>
          <div className="mono" style={{ fontSize: 10, color: V2.MUTE, letterSpacing:'0.16em', textTransform:'uppercase' }}>Voice quote</div>
          <div style={{ fontSize: 12.5, color: V2.TEXT_SOFT, lineHeight: 1.5, marginTop: 6, maxWidth: 180 }}>
            Transcripts always set in italic serif. Never in body sans.
          </div>
        </div>
        <div style={{ width: 1, alignSelf:'stretch', background: V2.RULE }} />
        <div className="serif-italic" style={{ fontSize: 30, color: V2.TEXT, lineHeight: 1.3, flex: 1 }}>
          “Could you push the meeting from two to three? Actually, let's make it tomorrow at ten.”
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  V2LogoCard, V2PaletteCard, V2TypeCard, V2MotifsCard,
});
