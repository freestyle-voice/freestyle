// Freestyle — Daily brand system cards (light mode): logo, palette, type, motifs.

// =================== LOGO CARD ===================
function V3LogoCard() {
  return (
    <div style={{
      width: 1100, height: 700, background: V3.CANVAS,
      padding: 48, boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', gap: 22,
      position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position:'absolute', top: 18, left: 18 }}><Crosshair3 /></div>
      <div style={{ position:'absolute', top: 18, right: 18 }}><Crosshair3 /></div>
      <div style={{ position:'absolute', bottom: 18, left: 18 }}><Crosshair3 /></div>
      <div style={{ position:'absolute', bottom: 18, right: 18 }}><Crosshair3 /></div>

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <V3Eyebrow text="01 — Identity" />
        <div style={{ fontSize: 12.5, color: V3.INK_SOFT, maxWidth: 380, textAlign:'right', lineHeight: 1.5 }}>
          Six marks explored. <strong style={{ color: V3.LIME_DEEP }}>Slash</strong> is recommended —
          a single thread that reads as cursor, waveform, and motion in one stroke.
        </div>
      </div>

      {/* Hero */}
      <div style={{
        background: V3.ELEVATED, borderRadius: 16, padding: '40px 44px',
        border: `1px solid ${V3.RULE}`,
        display:'flex', alignItems:'center', justifyContent:'space-between', gap: 32,
        position:'relative', overflow:'hidden',
      }}>
        <div style={{ position:'absolute', inset: 0, opacity: 0.07, display:'flex', alignItems:'center' }}>
          <ScopeTrace3 width={1100} height={140} weight={1.2} cycles={5} opacity={0.5} />
        </div>
        <div style={{ display:'flex', alignItems:'center', gap: 24, zIndex: 1 }}>
          <div style={{
            background: V3.LIME, borderRadius: 18, padding: '10px 14px',
            border: `1px solid ${V3.LIME_DEEP}`, display:'flex',
          }}>
            <MarkSlash3 size={92} color={V3.LIME_INK} />
          </div>
          <V3Wordmark size={92} color={V3.INK} accent={V3.LIME_DEEP} />
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap: 8, textAlign:'right', zIndex: 1 }}>
          <div className="mono" style={{ fontSize: 11, letterSpacing: '0.16em', textTransform:'uppercase', color: V3.LIME_DEEP }}>
            Recommended
          </div>
          <div className="serif" style={{ fontSize: 36, color: V3.INK, lineHeight: 1 }}>Slash</div>
          <div style={{ fontSize: 12.5, color: V3.INK_SOFT, lineHeight: 1.45, maxWidth: 220 }}>
            One stroke. Cursor, waveform, motion.
          </div>
        </div>
      </div>

      {/* Mark grid */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(6, 1fr)', gap: 10 }}>
        <V3MarkTile name="Slash"  tag="01" recommended><MarkSlash3 size={56} /></V3MarkTile>
        <V3MarkTile name="Caret"  tag="02"><MarkCaret3 size={56} /></V3MarkTile>
        <V3MarkTile name="Pulse"  tag="03"><MarkPulse3 size={56} /></V3MarkTile>
        <V3MarkTile name="Aurora" tag="04"><MarkAurora3 size={56} /></V3MarkTile>
        <V3MarkTile name="Listen" tag="05"><MarkListen3 size={56} /></V3MarkTile>
        <V3MarkTile name="Spark"  tag="06"><MarkSpark3 size={56} /></V3MarkTile>
      </div>

      {/* Construction */}
      <div style={{
        background: V3.ELEVATED, border: `1px solid ${V3.RULE}`, borderRadius: 14,
        padding: 22, display:'flex', alignItems:'center', gap: 36,
      }}>
        <div style={{ display:'flex', flexDirection:'column', gap: 6, minWidth: 180 }}>
          <div className="mono" style={{ fontSize: 10, letterSpacing: '0.16em', textTransform:'uppercase', color: V3.MUTE }}>
            Construction
          </div>
          <div style={{ fontSize: 13.5, color: V3.INK_SOFT, lineHeight: 1.45 }}>
            Stroke = 16% of unit. Round caps. 30° lean — matches the italic <span className="serif-italic" style={{ color: V3.LIME_DEEP }}>i</span>.
          </div>
        </div>
        <div style={{ width: 140, height: 140, position: 'relative', flexShrink: 0 }}>
          <svg width="140" height="140" style={{ position:'absolute', inset: 0 }}>
            <rect x="0" y="0" width="140" height="140" fill="none" stroke={V3.RULE} strokeWidth="1" />
            {[0.25, 0.5, 0.75].map(t => (
              <g key={t}>
                <line x1={t*140} y1="0" x2={t*140} y2="140" stroke={V3.RULE_SOFT} strokeWidth="1" />
                <line x1="0" y1={t*140} x2="140" y2={t*140} stroke={V3.RULE_SOFT} strokeWidth="1" />
              </g>
            ))}
          </svg>
          <div style={{ position:'absolute', inset: 0, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <MarkSlash3 size={100} />
          </div>
        </div>
        <div style={{ flex: 1, display:'flex', alignItems:'baseline', justifyContent:'space-around', gap: 22 }}>
          {[16, 24, 40, 64].map(s => (
            <div key={s} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap: 10 }}>
              <MarkSlash3 size={s} />
              <span className="mono" style={{ fontSize: 10, color: V3.MUTE, letterSpacing: '0.06em' }}>{s}px</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function V3MarkTile({ children, name, tag, recommended }) {
  return (
    <div style={{
      background: recommended ? V3.LIME_SOFT : V3.ELEVATED,
      border: `1px solid ${recommended ? V3.LIME_DEEP : V3.RULE}`,
      borderRadius: 12, padding: 16,
      display:'flex', flexDirection:'column', alignItems:'center', gap: 10,
      position: 'relative',
    }}>
      <div style={{
        position:'absolute', top: 8, left: 10,
        fontSize: 9, fontFamily: 'JetBrains Mono', color: V3.MUTE, letterSpacing:'0.1em',
      }}>{tag}</div>
      {recommended && (
        <div style={{
          position:'absolute', top: 8, right: 10,
          width: 5, height: 5, borderRadius: '50%', background: V3.LIME_DEEP,
        }} />
      )}
      <div style={{ height: 56, display:'flex', alignItems:'center', justifyContent:'center', marginTop: 8 }}>
        {children}
      </div>
      <div style={{ fontSize: 12, color: V3.INK, fontWeight: 500 }}>{name}</div>
    </div>
  );
}

// =================== PALETTE CARD ===================
function V3PaletteCard() {
  const surfaces = [
    { name: 'Canvas',   hex: V3.CANVAS,   use: 'Page background' },
    { name: 'Paper',    hex: V3.PAPER,    use: 'Sections, nav' },
    { name: 'Elevated', hex: V3.ELEVATED, use: 'Cards, surfaces' },
    { name: 'Rule',     hex: V3.RULE,     use: 'Hairlines, dividers' },
  ];
  const inks = [
    { name: 'Ink',       hex: V3.INK,      use: 'Headlines, body' },
    { name: 'Ink soft',  hex: V3.INK_SOFT, use: 'Secondary copy' },
    { name: 'Mute',      hex: V3.MUTE,     use: 'Labels, axes' },
  ];
  return (
    <div style={{
      width: 1100, height: 700, background: V3.CANVAS,
      padding: 48, boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', gap: 22, position: 'relative',
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <V3Eyebrow text="02 — Color" />
        <div style={{ fontSize: 12.5, color: V3.INK_SOFT, maxWidth: 460, textAlign:'right', lineHeight: 1.5 }}>
          Warm paper, deep ink. The chartreuse splits into two roles: <strong style={{ color: V3.LIME_DEEP }}>vivid fill</strong> for live moments, <strong style={{ color: V3.LIME_DEEP }}>deep ink</strong> for type and lines.
        </div>
      </div>

      {/* Two-role accent block */}
      <div style={{ display:'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14 }}>
        <div style={{
          background: V3.LIME, borderRadius: 16, padding: '28px 32px',
          border: `1px solid ${V3.LIME_DEEP}`, display:'flex', alignItems:'flex-end',
          justifyContent:'space-between', minHeight: 160,
        }}>
          <div>
            <div className="mono" style={{ fontSize: 10.5, letterSpacing:'0.16em', textTransform:'uppercase', color: V3.LIME_INK, opacity: 0.7 }}>
              Vivid fill · live states
            </div>
            <div className="serif-italic" style={{ fontSize: 76, color: V3.LIME_INK, lineHeight: 0.95, marginTop: 4 }}>
              Chartreuse
            </div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div className="mono" style={{ fontSize: 11, color: V3.LIME_INK, opacity: 0.7 }}>#D8FF3D</div>
            <div className="mono" style={{ fontSize: 11, color: V3.LIME_INK, opacity: 0.7 }}>oklch 0.96 .22 117</div>
          </div>
        </div>
        <div style={{
          background: V3.LIME_SOFT, borderRadius: 16, padding: '28px 32px',
          border: `1px solid ${V3.LIME_DEEP}55`, display:'flex', alignItems:'flex-end',
          justifyContent:'space-between', minHeight: 160,
        }}>
          <div>
            <div className="mono" style={{ fontSize: 10.5, letterSpacing:'0.16em', textTransform:'uppercase', color: V3.LIME_INK, opacity: 0.7 }}>
              Deep · type & lines
            </div>
            <div className="serif-italic" style={{ fontSize: 56, color: V3.LIME_INK, lineHeight: 0.95, marginTop: 4 }}>
              Olive
            </div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div className="mono" style={{ fontSize: 11, color: V3.LIME_INK, opacity: 0.7 }}>#6B8F12</div>
            <div className="mono" style={{ fontSize: 11, color: V3.LIME_INK, opacity: 0.7 }}>oklch 0.62 .15 117</div>
          </div>
        </div>
      </div>

      {/* Surfaces row */}
      <div>
        <div className="mono" style={{ fontSize: 10, letterSpacing:'0.16em', textTransform:'uppercase', color: V3.MUTE, marginBottom: 10 }}>Surfaces</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap: 10 }}>
          {surfaces.map(s => (
            <div key={s.name} style={{
              background: s.hex, height: 96, borderRadius: 12,
              border: `1px solid ${V3.RULE}`, padding: 14,
              display:'flex', flexDirection:'column', justifyContent:'space-between',
            }}>
              <div style={{ fontSize: 13, color: V3.INK, fontWeight: 500 }}>{s.name}</div>
              <div>
                <div className="mono" style={{ fontSize: 10, color: V3.INK_SOFT }}>{s.hex}</div>
                <div style={{ fontSize: 11, color: V3.MUTE, marginTop: 2 }}>{s.use}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Inks row */}
      <div>
        <div className="mono" style={{ fontSize: 10, letterSpacing:'0.16em', textTransform:'uppercase', color: V3.MUTE, marginBottom: 10 }}>Inks & accents</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap: 10 }}>
          {inks.map(s => (
            <div key={s.name} style={{
              background: V3.ELEVATED, height: 96, borderRadius: 12,
              border: `1px solid ${V3.RULE}`, padding: 14,
              display:'flex', flexDirection:'column', justifyContent:'space-between',
            }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: s.hex, border: `1px solid ${V3.RULE}` }} />
              <div>
                <div style={{ fontSize: 12.5, color: V3.INK }}>{s.name}</div>
                <div className="mono" style={{ fontSize: 10, color: V3.MUTE }}>{s.hex}</div>
              </div>
            </div>
          ))}
          <div style={{
            background: V3.ELEVATED, height: 96, borderRadius: 12,
            border: `1px solid ${V3.RULE}`, padding: 14,
            display:'flex', flexDirection:'column', justifyContent:'space-between',
          }}>
            <div style={{ display:'flex', gap: 6 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: V3.BLUSH }} />
              <div style={{ width: 28, height: 28, borderRadius: 8, background: V3.PLUM }} />
            </div>
            <div>
              <div style={{ fontSize: 12.5, color: V3.INK }}>Blush · Plum</div>
              <div className="mono" style={{ fontSize: 10, color: V3.MUTE }}>Use sparingly</div>
            </div>
          </div>
          <div style={{
            background: 'transparent', border: `1px dashed ${V3.RULE}`,
            height: 96, borderRadius: 12, padding: 14,
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize: 11, color: V3.MUTE, lineHeight: 1.4, textAlign:'center',
          }}>
            No other<br/>system color
          </div>
        </div>
      </div>
    </div>
  );
}

// =================== TYPE CARD ===================
function V3TypeCard() {
  return (
    <div style={{
      width: 1100, height: 700, background: V3.CANVAS,
      padding: 48, boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', gap: 16, position: 'relative',
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <V3Eyebrow text="03 — Type" />
        <div style={{ fontSize: 12.5, color: V3.INK_SOFT, maxWidth: 420, textAlign:'right', lineHeight: 1.5 }}>
          A hot italic serif for voice moments, a neutral grotesque for everything else, mono for technical.
        </div>
      </div>

      <div style={{
        background: V3.ELEVATED, borderRadius: 16, padding: '32px 40px',
        border: `1px solid ${V3.RULE}`,
        display:'grid', gridTemplateColumns: '170px 1fr', gap: 28, alignItems:'center',
      }}>
        <div>
          <div className="mono" style={{ fontSize: 10, color: V3.LIME_DEEP, letterSpacing:'0.14em', textTransform:'uppercase' }}>Display</div>
          <div style={{ fontSize: 14, color: V3.INK, marginTop: 6, fontWeight: 500 }}>Instrument Serif</div>
          <div style={{ fontSize: 11.5, color: V3.MUTE, marginTop: 4, lineHeight: 1.5 }}>
            Italic, high-contrast. Voice headlines, brand moments, pull quotes.
          </div>
        </div>
        <div>
          <div className="serif-italic" style={{ fontSize: 110, color: V3.INK, lineHeight: 0.9, letterSpacing: '-0.01em' }}>
            Speak <span style={{ color: V3.LIME_DEEP }}>freely.</span>
          </div>
        </div>
      </div>

      <div style={{
        background: V3.ELEVATED, borderRadius: 16, padding: '24px 40px',
        border: `1px solid ${V3.RULE}`,
        display:'grid', gridTemplateColumns: '170px 1fr', gap: 28, alignItems:'center',
      }}>
        <div>
          <div className="mono" style={{ fontSize: 10, color: V3.LIME_DEEP, letterSpacing:'0.14em', textTransform:'uppercase' }}>UI / Body</div>
          <div style={{ fontSize: 14, color: V3.INK, marginTop: 6, fontWeight: 500 }}>DM Sans</div>
          <div style={{ fontSize: 11.5, color: V3.MUTE, marginTop: 4, lineHeight: 1.5 }}>
            300 / 450 / 600. Tight on UI, generous on long-form.
          </div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap: 8 }}>
          <div style={{ fontSize: 32, color: V3.INK, fontWeight: 500, letterSpacing:'-0.018em', lineHeight: 1.1 }}>
            The cursor doesn't have to be here.
          </div>
          <div style={{ fontSize: 15, color: V3.INK_SOFT, lineHeight: 1.5 }}>
            Hold the globe key in any app — Slack, Notes, the URL bar — and Freestyle pastes at your cursor when you release.
          </div>
        </div>
      </div>

      <div style={{
        background: V3.ELEVATED, borderRadius: 16, padding: '22px 40px',
        border: `1px solid ${V3.RULE}`,
        display:'grid', gridTemplateColumns: '170px 1fr', gap: 28, alignItems:'center',
      }}>
        <div>
          <div className="mono" style={{ fontSize: 10, color: V3.LIME_DEEP, letterSpacing:'0.14em', textTransform:'uppercase' }}>Mono</div>
          <div style={{ fontSize: 14, color: V3.INK, marginTop: 6, fontWeight: 500 }}>JetBrains Mono</div>
          <div style={{ fontSize: 11.5, color: V3.MUTE, marginTop: 4, lineHeight: 1.5 }}>
            Timecodes, hotkeys, model names, status.
          </div>
        </div>
        <div className="mono" style={{ display:'flex', flexDirection:'column', gap: 6 }}>
          <div style={{ fontSize: 13, color: V3.INK_SOFT, letterSpacing:'0.04em' }}>0:04.18 · WHISPER.BASE.EN · 14 WORDS</div>
          <div style={{ fontSize: 13, color: V3.MUTE, letterSpacing:'0.04em' }}>hold <span style={{ color: V3.LIME_DEEP, fontWeight: 600 }}>fn</span> · release to paste</div>
        </div>
      </div>
    </div>
  );
}

// =================== MOTIFS CARD ===================
function V3MotifsCard() {
  return (
    <div style={{
      width: 1100, height: 700, background: V3.CANVAS,
      padding: 48, boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', gap: 22, position: 'relative',
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <V3Eyebrow text="04 — Motifs" />
        <div style={{ fontSize: 12.5, color: V3.INK_SOFT, maxWidth: 460, textAlign:'right', lineHeight: 1.5 }}>
          Three families. Use one per surface — never combine trace with bars in the same composition.
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, flex: 1 }}>
        <div style={{
          background: V3.ELEVATED, border: `1px solid ${V3.RULE}`, borderRadius: 14,
          padding: 22, display:'flex', flexDirection:'column', gap: 14,
        }}>
          <div className="mono" style={{ fontSize: 10, color: V3.LIME_DEEP, letterSpacing:'0.16em', textTransform:'uppercase' }}>A · Scope trace</div>
          <div style={{ flex: 1, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <ScopeTrace3 width={300} height={120} cycles={3.5} weight={1.6} />
          </div>
          <div style={{ fontSize: 12.5, color: V3.INK_SOFT, lineHeight: 1.5 }}>
            Continuous signal. Masthead, brand poster, backgrounds.
          </div>
        </div>

        <div style={{
          background: V3.ELEVATED, border: `1px solid ${V3.RULE}`, borderRadius: 14,
          padding: 22, display:'flex', flexDirection:'column', gap: 14,
        }}>
          <div className="mono" style={{ fontSize: 10, color: V3.LIME_DEEP, letterSpacing:'0.16em', textTransform:'uppercase' }}>B · Voice bars</div>
          <div style={{ flex: 1, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <VoiceBars3 count={20} width={260} height={80} animated />
          </div>
          <div style={{ fontSize: 12.5, color: V3.INK_SOFT, lineHeight: 1.5 }}>
            Live levels. Pill, recording states, micro-feedback.
          </div>
        </div>

        <div style={{
          background: V3.ELEVATED, border: `1px solid ${V3.RULE}`, borderRadius: 14,
          padding: 22, display:'flex', flexDirection:'column', gap: 14,
        }}>
          <div className="mono" style={{ fontSize: 10, color: V3.LIME_DEEP, letterSpacing:'0.16em', textTransform:'uppercase' }}>C · Pulse ring</div>
          <div style={{ flex: 1, display:'flex', alignItems:'center', justifyContent:'center' }}>
            <PulseRing3 size={140} count={4} />
          </div>
          <div style={{ fontSize: 12.5, color: V3.INK_SOFT, lineHeight: 1.5 }}>
            Room tone. Empty states, completion echoes.
          </div>
        </div>
      </div>

      <div style={{
        background: V3.ELEVATED, border: `1px solid ${V3.RULE}`, borderRadius: 14,
        padding: '22px 28px', display:'flex', alignItems:'center', gap: 28,
      }}>
        <div style={{ flexShrink: 0 }}>
          <div className="mono" style={{ fontSize: 10, color: V3.MUTE, letterSpacing:'0.16em', textTransform:'uppercase' }}>Voice quote</div>
          <div style={{ fontSize: 12.5, color: V3.INK_SOFT, lineHeight: 1.5, marginTop: 6, maxWidth: 180 }}>
            Transcripts always set in italic serif. Never in body sans.
          </div>
        </div>
        <div style={{ width: 1, alignSelf:'stretch', background: V3.RULE }} />
        <div className="serif-italic" style={{ fontSize: 28, color: V3.INK, lineHeight: 1.3, flex: 1 }}>
          “Could you push the meeting from two to three? Actually, let's make it tomorrow at ten.”
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  V3LogoCard, V3PaletteCard, V3TypeCard, V3MotifsCard,
});
