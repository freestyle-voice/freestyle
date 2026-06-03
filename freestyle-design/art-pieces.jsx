// Freestyle — Artwork pieces featuring Echo the mascot (v2).

// ============================================================
// PIECE 01 — Meet Echo · portrait
// ============================================================
function ArtworkMeetEcho() {
  return (
    <div style={{
      width: 900, height: 1100, background: A.CANVAS,
      padding: 48, boxSizing: 'border-box', position: 'relative', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* Corner ticks */}
      {[[20,20],[20,'r'],['b',20],['b','r']].map((p, i) => (
        <div key={i} style={{
          position:'absolute',
          ...(p[0] === 'b' ? { bottom: 20 } : { top: p[0] }),
          ...(p[1] === 'r' ? { right: 20 } : { left: p[1] }),
        }}>
          <svg width="12" height="12" viewBox="0 0 12 12">
            <line x1="6" y1="0" x2="6" y2="12" stroke={A.RULE} strokeWidth="1" />
            <line x1="0" y1="6" x2="12" y2="6" stroke={A.RULE} strokeWidth="1" />
          </svg>
        </div>
      ))}

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div className="mono" style={{ fontSize: 11.5, letterSpacing: '0.2em', textTransform:'uppercase', color: A.MUTE }}>
          Freestyle · mascot
        </div>
        <div className="mono" style={{ fontSize: 11.5, letterSpacing: '0.2em', textTransform:'uppercase', color: A.MUTE }}>
          № 01 · portrait
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${A.INK}`, marginTop: 14 }} />
      <div style={{ borderTop: `3px solid ${A.INK}`, marginTop: 3 }} />

      <h1 style={{ margin: '38px 0 0' }}>
        <span className="serif" style={{ fontSize: 130, color: A.INK, lineHeight: 0.9, letterSpacing: '-0.03em', fontWeight: 400 }}>Meet </span>
        <span className="serif-italic" style={{ fontSize: 130, color: A.OLIVE, lineHeight: 0.9 }}>Echo.</span>
      </h1>

      <div style={{ flex: 1, display:'flex', alignItems:'center', justifyContent:'center', position:'relative' }}>
        {/* Pulse rings backdrop */}
        <div style={{ position:'absolute', inset: 0, display:'flex', alignItems:'center', justifyContent:'center', opacity: 0.45 }}>
          <svg width="700" height="700" viewBox="0 0 700 700">
            <PulseRingsBg cx={350} cy={350} color={A.OLIVE} count={5} maxR={310} />
          </svg>
        </div>
        <div style={{ position:'relative', zIndex: 1 }}>
          <Echo size={560} expression="happy" />
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${A.INK}`, paddingTop: 18, display:'flex', justifyContent:'space-between', alignItems:'flex-end' }}>
        <div>
          <div className="serif-italic" style={{ fontSize: 32, color: A.INK, lineHeight: 1 }}>
            “Hi. I echolocate.”
          </div>
          <div className="mono" style={{ fontSize: 10.5, color: A.MUTE, letterSpacing: '0.18em', textTransform:'uppercase', marginTop: 8 }}>
            Dolphin · Olive &amp; Cream · 2026
          </div>
        </div>
        <div className="mono" style={{ fontSize: 10.5, color: A.MUTE, letterSpacing: '0.14em', textAlign:'right', lineHeight: 1.5, textTransform:'uppercase' }}>
          h 280 · w 400<br />
          edition · alpha
        </div>
      </div>
    </div>
  );
}


// ============================================================
// PIECE 02 — Studio session · Echo next to a mic, sound waves
// ============================================================
function ArtworkStudio() {
  return (
    <div style={{
      width: 1200, height: 800, background: A.OLIVE,
      padding: 56, boxSizing: 'border-box', position: 'relative', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', justifyContent:'space-between',
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', position:'relative', zIndex: 2 }}>
        <div className="mono" style={{ fontSize: 12, letterSpacing: '0.2em', textTransform:'uppercase', color: A.CREAM, opacity: 0.7 }}>
          Studio session · Take 01
        </div>
        <div style={{
          display:'inline-flex', alignItems:'center', gap: 8, padding: '6px 12px',
          background: A.CREAM, borderRadius: 4,
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: A.OLIVE_INK }} />
          <span className="mono" style={{ fontSize: 11, letterSpacing: '0.14em', color: A.OLIVE_INK, fontWeight: 600 }}>
            ON AIR
          </span>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns: '1fr 1fr', alignItems:'center', gap: 24, flex: 1, position:'relative', zIndex: 1 }}>
        <div>
          <h1 style={{ margin: 0 }}>
            <span className="serif" style={{ fontSize: 130, color: A.CREAM, lineHeight: 0.86, letterSpacing: '-0.03em', fontWeight: 400 }}>On the</span>
            <br />
            <span className="serif-italic" style={{ fontSize: 130, color: A.CREAM, lineHeight: 0.86 }}>record.</span>
          </h1>
          <p style={{
            margin: '28px 0 0', fontSize: 17, color: A.CREAM, opacity: 0.85, lineHeight: 1.5,
            maxWidth: 380, letterSpacing: '-0.005em', textWrap: 'pretty',
          }}>
            Every word, captured on-device. Locally transcribed. Pasted where your cursor lives.
          </p>
        </div>

        {/* Echo speaking with sound waves */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', position:'relative' }}>
          {/* Big sound wave halo around the rostrum */}
          <svg viewBox="-60 -60 600 500" width="560" height="460" style={{ position:'absolute', overflow:'visible' }}>
            {[1, 2, 3, 4, 5].map(i => {
              const r = 80 + i * 38;
              return (
                <path key={i}
                  d={`M ${430 + r * Math.cos(Math.PI * -0.32)} ${190 + r * Math.sin(Math.PI * -0.32)}
                      A ${r} ${r} 0 0 1 ${430 + r * Math.cos(Math.PI * 0.32)} ${190 + r * Math.sin(Math.PI * 0.32)}`}
                  fill="none"
                  stroke={A.CREAM}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  opacity={0.18 + (5 - i) * 0.13}
                />
              );
            })}
          </svg>

          <div style={{ position:'relative', zIndex: 1 }}>
            <Echo size={460} expression="speaking" body={A.CREAM} belly={A.OLIVE_SOFT} outline={A.INK} />
          </div>
        </div>
      </div>

      <div style={{ borderTop: `1px solid rgba(248,241,222,0.3)`, paddingTop: 16, display:'flex', justifyContent:'space-between', alignItems:'flex-end', position:'relative', zIndex: 2 }}>
        <div style={{ display:'flex', alignItems:'center', gap: 12 }}>
          <Echo size={36} expression="happy" chest={false} blush={false}
            body={A.CREAM} accent={A.OLIVE_INK} outline={A.CREAM} outlineWidth={3} />
          <span className="serif-italic" style={{ fontSize: 24, color: A.CREAM }}>echo for freestyle.</span>
        </div>
        <div className="mono" style={{ fontSize: 11, color: A.CREAM, opacity: 0.7, letterSpacing: '0.18em', textTransform:'uppercase' }}>
          № 02 · session
        </div>
      </div>
    </div>
  );
}


// ============================================================
// PIECE 03 — Silhouette poster
// ============================================================
function ArtworkSilhouette() {
  return (
    <div style={{
      width: 800, height: 1100, background: A.CANVAS,
      padding: 56, boxSizing: 'border-box', position: 'relative', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div className="mono" style={{ fontSize: 11.5, letterSpacing: '0.2em', textTransform:'uppercase', color: A.MUTE }}>
          A study in silence
        </div>
        <div className="mono" style={{ fontSize: 11.5, letterSpacing: '0.2em', textTransform:'uppercase', color: A.MUTE }}>
          № 03
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${A.INK}`, marginTop: 14 }} />

      <div style={{ marginTop: 40 }}>
        <h1 style={{ margin: 0 }}>
          <span className="serif-italic" style={{ fontSize: 110, color: A.INK, lineHeight: 0.9 }}>
            Quiet,
          </span>
          <br />
          <span className="serif" style={{ fontSize: 110, color: A.INK, lineHeight: 0.9, letterSpacing: '-0.03em', fontWeight: 400 }}>
            until you're not.
          </span>
        </h1>
      </div>

      <div style={{ flex: 1, display:'flex', alignItems:'center', justifyContent:'center', marginTop: 36, position:'relative' }}>
        <div style={{ position:'absolute', bottom: 60, left:'50%', transform:'translateX(-50%)', width: 360, height: 14, background: A.INK, opacity: 0.08, borderRadius:'50%', filter: 'blur(6px)' }} />
        <Echo size={620} silhouette body={A.OLIVE} />
      </div>

      <div style={{ borderTop: `1px solid ${A.INK}`, paddingTop: 16, display:'flex', justifyContent:'space-between', alignItems:'baseline' }}>
        <div className="mono" style={{ fontSize: 11, color: A.MUTE, letterSpacing: '0.16em', textTransform:'uppercase' }}>
          Echo · in olive
        </div>
        <div className="serif-italic" style={{ fontSize: 22, color: A.INK }}>
          freestyle.
        </div>
      </div>
    </div>
  );
}


// ============================================================
// PIECE 04 — Sticker sheet · 4 moods + 2 flipped
// ============================================================
function ArtworkStickerSheet() {
  const tiles = [
    { exp: 'happy',     label: 'hello',     flip: false },
    { exp: 'speaking',  label: 'speaking',  flip: false },
    { exp: 'surprised', label: 'huh?',      flip: false },
    { exp: 'sleeping',  label: 'sleeping',  flip: false },
    { exp: 'happy',     label: 'facing you',flip: true  },
    { exp: 'happy',     label: 'silhouette',flip: false, silhouette: true },
  ];

  return (
    <div style={{
      width: 1200, height: 800, background: A.PAPER,
      padding: 56, boxSizing: 'border-box', position: 'relative', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', gap: 22,
    }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
        <div className="mono" style={{ fontSize: 11.5, letterSpacing: '0.2em', textTransform:'uppercase', color: A.MUTE }}>
          Sticker sheet · Echo in 6 moods
        </div>
        <div className="mono" style={{ fontSize: 11.5, letterSpacing: '0.2em', textTransform:'uppercase', color: A.MUTE }}>
          № 04 · stickers
        </div>
      </div>

      <h1 className="serif-italic" style={{ margin: 0, fontSize: 76, color: A.INK, lineHeight: 0.95 }}>
        peel &amp; <span style={{ color: A.OLIVE }}>stick.</span>
      </h1>

      <div style={{
        flex: 1, display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gridTemplateRows: 'repeat(2, 1fr)', gap: 16,
      }}>
        {tiles.map((t, i) => (
          <div key={i} style={{
            background: A.CREAM,
            border: `2px dashed ${A.RULE}`,
            borderRadius: 18,
            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
            padding: '18px 8px 14px',
            gap: 6,
          }}>
            <div style={{ flex: 1, display:'flex', alignItems:'center', justifyContent:'center', minHeight: 0 }}>
              <Echo size={230} expression={t.exp} flip={t.flip} silhouette={t.silhouette} accent={A.OLIVE} />
            </div>
            <div className="mono" style={{
              fontSize: 10.5, letterSpacing:'0.18em', textTransform:'uppercase', color: A.MUTE,
            }}>{t.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}


// ============================================================
// PIECE 05 — Pattern wall
// ============================================================
function ArtworkPattern() {
  const cols = 7;
  const rows = 9;
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      cells.push({ r, c, i, offset: r % 2 === 1 ? 0.5 : 0 });
    }
  }

  // Mini Echo head — simplified dolphin face glyph for the pattern
  const HeadGlyph = ({ size = 80, color = A.OLIVE }) => (
    <svg viewBox="0 0 100 80" width={size} height={size * 0.8} style={{ overflow:'visible' }}>
      {/* Side-profile dolphin head: melon + short rostrum */}
      <path d="M 8 50
               Q 14 18, 42 14
               Q 60 18, 64 38
               Q 80 50, 96 60
               Q 84 66, 70 66
               Q 60 66, 52 72
               Q 28 78, 12 66
               Q 6 60, 8 50 Z"
        fill="none" stroke={color} strokeWidth="3.2" strokeLinejoin="round" />
      {/* Eye */}
      <circle cx="58" cy="40" r="2.6" fill={color} />
      {/* Smile */}
      <path d="M 68 60 Q 78 64, 86 60" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );

  // Wave glyph
  const WaveGlyph = ({ size = 70, color = A.OLIVE }) => (
    <svg viewBox="0 0 100 100" width={size} height={size * 0.5} style={{ overflow:'visible' }}>
      <polyline
        points="8.00,50.00 13.60,47.98 19.20,45.96 24.80,50.00 30.40,58.08 36.00,60.10 41.60,50.00 47.20,35.85 50.00,32.50 52.80,33.83 58.40,50.00 64.00,70.21 68.20,74.23 72.40,63.42 78.00,35.42 83.60,18.50 87.80,26.49 92.00,50.00"
        fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  return (
    <div style={{
      width: 900, height: 1100, background: A.CANVAS,
      padding: 32, boxSizing: 'border-box', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', inset: 0,
        display: 'grid',
        gridTemplateColumns: `repeat(${cols}, 1fr)`,
        gridTemplateRows: `repeat(${rows}, 1fr)`,
        padding: 32,
      }}>
        {cells.map(cell => (
          <div key={cell.i} style={{
            display:'flex', alignItems:'center', justifyContent:'center',
            transform: `translateX(${cell.offset * 30}px)`,
          }}>
            {cell.i % 3 === 0 ? <WaveGlyph size={70} /> : <HeadGlyph size={68} />}
          </div>
        ))}
      </div>

      <div style={{
        position: 'absolute', left: '50%', top: '50%', transform:'translate(-50%, -50%)',
        background: A.CREAM, border: `1px solid ${A.INK}`,
        padding: '28px 36px', textAlign:'center',
        boxShadow: '0 8px 28px -8px rgba(20,12,4,0.15)',
      }}>
        <div className="mono" style={{ fontSize: 10.5, letterSpacing:'0.2em', textTransform:'uppercase', color: A.MUTE, marginBottom: 8 }}>
          Pattern № 05
        </div>
        <div className="serif-italic" style={{ fontSize: 56, color: A.INK, lineHeight: 0.95 }}>
          freestyle.
        </div>
        <div className="serif" style={{ fontSize: 26, color: A.INK_SOFT, marginTop: 6, letterSpacing:'-0.01em' }}>
          Voice, repeating.
        </div>
      </div>
    </div>
  );
}


// ============================================================
// PIECE 06 — Wide hero banner (README / social cover)
// ============================================================
function ArtworkBanner() {
  return (
    <div style={{
      width: 1600, height: 600, background: A.CANVAS,
      padding: 48, boxSizing: 'border-box', position: 'relative', overflow: 'hidden',
      display: 'flex', alignItems:'center', gap: 48,
    }}>
      <div style={{
        flexShrink: 0, width: 520, height: '100%',
        display:'flex', alignItems:'center', justifyContent:'center',
        position:'relative',
      }}>
        <div style={{
          position:'absolute', width: 460, height: 460, borderRadius: '50%',
          background: A.OLIVE_SOFT, zIndex: 0,
        }} />
        <div style={{ position:'relative', zIndex: 1 }}>
          <Echo size={520} expression="happy" />
        </div>
      </div>

      <div style={{ flex: 1, display:'flex', flexDirection:'column', justifyContent:'center', gap: 28 }}>
        <div className="mono" style={{ fontSize: 12, letterSpacing: '0.18em', textTransform:'uppercase', color: A.MUTE }}>
          Open-source voice dictation for macOS
        </div>

        <h1 style={{ margin: 0 }}>
          <span className="serif" style={{ fontSize: 116, color: A.INK, lineHeight: 0.86, letterSpacing: '-0.035em', fontWeight: 400 }}>
            Hi, I'm
          </span>
          <br />
          <span className="serif-italic" style={{ fontSize: 116, color: A.OLIVE, lineHeight: 0.86 }}>
            Echo.
          </span>
        </h1>

        <p style={{
          margin: 0, fontSize: 19, color: A.INK_SOFT, lineHeight: 1.5, maxWidth: 540, textWrap: 'pretty',
        }}>
          I live in your menu bar. Hold <Kbd>fn</Kbd>, talk to me, and I'll paste what you said at your cursor. Anywhere on your Mac.
        </p>

        <div style={{ display:'flex', alignItems:'center', gap: 18, marginTop: 8 }}>
          <ButtonInk>Download for macOS →</ButtonInk>
          <span className="mono" style={{ fontSize: 11, color: A.MUTE, letterSpacing:'0.14em', textTransform:'uppercase' }}>
            MIT · 0.1 alpha
          </span>
        </div>
      </div>

      <div style={{ position:'absolute', top: 32, right: 36, display:'flex', alignItems:'center', gap: 8 }}>
        <svg viewBox="0 0 100 100" width="22" height="22">
          <polyline
            points="8.00,50.00 13.60,47.98 19.20,45.96 24.80,50.00 30.40,58.08 36.00,60.10 41.60,50.00 47.20,35.85 50.00,32.50 52.80,33.83 58.40,50.00 64.00,70.21 68.20,74.23 72.40,63.42 78.00,35.42 83.60,18.50 87.80,26.49 92.00,50.00"
            fill="none" stroke={A.OLIVE} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="serif-italic" style={{ fontSize: 18, color: A.INK }}>freestyle.</span>
      </div>
    </div>
  );
}

function Kbd({ children }) {
  return (
    <span className="mono" style={{
      display:'inline-flex', alignItems:'center', justifyContent:'center',
      height: 22, padding: '0 7px',
      background: A.PAPER, border: `1px solid ${A.RULE}`,
      borderBottomWidth: 2, borderRadius: 5,
      fontSize: 12, color: A.INK, fontWeight: 500,
      verticalAlign: 'middle',
    }}>{children}</span>
  );
}

function ButtonInk({ children }) {
  return (
    <span style={{
      display:'inline-flex', alignItems:'center', height: 46, padding: '0 22px',
      background: A.INK, color: A.CANVAS, borderRadius: 8,
      fontSize: 14, fontWeight: 500,
    }}>{children}</span>
  );
}

Object.assign(window, {
  ArtworkMeetEcho, ArtworkStudio, ArtworkSilhouette,
  ArtworkStickerSheet, ArtworkPattern, ArtworkBanner,
});
