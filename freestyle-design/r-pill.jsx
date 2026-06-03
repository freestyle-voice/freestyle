// Freestyle — Pill variants. Three directions, all small/Raycast-style.
//
// A · Strip       — solid dark capsule, ~32px tall. Lowest profile.
// B · Cream       — light/cream capsule matching the brand. Same height.
// C · Glass       — translucent/frosted, content-aware. Sits over any desktop.
//
// Each direction shows 5 states: idle, recording, transcribing, pasted, error.

// ============================================================
// SHARED — animated bars, spinner, recording dot, check
// ============================================================

function PillBars({ count = 12, color, width = 64, height = 14, seed = 0 }) {
  const heights = React.useMemo(() => {
    return Array.from({ length: count }, (_, i) => {
      const s = Math.sin((i + 1 + seed) * 12.9898) * 43758.5453;
      const r = s - Math.floor(s);
      const env = 1 - Math.abs((i / (count - 1)) - 0.5) * 1.4;
      return Math.max(0.2, Math.min(1, (0.4 + r * 0.6) * env));
    });
  }, [count, seed]);

  const barW = (width - (count - 1) * 2) / count;
  return (
    <div style={{ display:'inline-flex', alignItems:'center', gap: 2, width, height }}>
      {heights.map((h, i) => (
        <span key={i} style={{
          width: barW, height: `${h * 100}%`, background: color, borderRadius: 999,
          animation: `pBar 0.9s ${(i % 7) * 0.08}s infinite ease-in-out alternate`,
          transformOrigin: 'center',
        }} />
      ))}
      <style>{`@keyframes pBar { 0%{transform:scaleY(0.45)} 100%{transform:scaleY(1.05)} }`}</style>
    </div>
  );
}

function PillDot({ color, size = 6, pulse = true }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%', background: color,
      flexShrink: 0,
      animation: pulse ? 'pDot 1.6s infinite ease-in-out' : 'none',
    }}>
      <style>{`@keyframes pDot { 0%,100%{opacity:0.5;transform:scale(0.9)} 50%{opacity:1;transform:scale(1.15)} }`}</style>
    </span>
  );
}

function PillSpinner({ color, size = 12 }) {
  return (
    <span style={{ display:'inline-flex', gap: 3, alignItems:'center' }}>
      {[0,1,2].map(i => (
        <span key={i} style={{
          width: 3, height: 3, borderRadius:'50%', background: color,
          animation: `pSpin 1s ${i*0.15}s infinite ease-in-out`,
        }} />
      ))}
      <style>{`@keyframes pSpin{0%,100%{opacity:0.25;transform:translateY(0)}50%{opacity:1;transform:translateY(-2px)}}`}</style>
    </span>
  );
}

// ============================================================
// DIRECTION A — STRIP (solid dark, lowest profile)
// ============================================================
// 30px tall, soft black, olive-tinted accents. Ultra-minimal.
function PillStrip({ state }) {
  const H = 30;
  const base = {
    height: H,
    padding: '0 10px',
    borderRadius: H / 2,
    background: R.D_INK,
    color: R.D_TEXT,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 9,
    border: `1px solid rgba(255,255,255,0.06)`,
    boxShadow: '0 6px 20px -6px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
    fontFamily: 'DM Sans',
    fontSize: 12,
    fontWeight: 500,
    minWidth: 120,
  };

  if (state === 'idle') {
    return (
      <div style={base}>
        <Wave size={14} color={R.OLIVE} />
        <span style={{ color: 'rgba(236,231,214,0.55)', fontSize: 11.5 }}>Hold</span>
        <span className="mono" style={{
          padding: '1px 5px', background: 'rgba(255,255,255,0.07)',
          border: `1px solid rgba(255,255,255,0.08)`, borderRadius: 4,
          fontSize: 10, letterSpacing: '0.04em', color: R.D_TEXT,
        }}>⌥ Space</span>
      </div>
    );
  }
  if (state === 'recording') {
    return (
      <div style={{ ...base, paddingRight: 12 }}>
        <PillDot color={R.OLIVE} size={6} />
        <PillBars count={12} color="rgba(236,231,214,0.55)" width={54} height={12} />
        <span className="mono" style={{ fontSize: 10.5, color: R.D_MUTE, letterSpacing:'0.04em' }}>0:04</span>
      </div>
    );
  }
  if (state === 'transcribing') {
    return (
      <div style={base}>
        <PillSpinner color={R.OLIVE} />
        <span style={{ color: R.D_TEXT, fontSize: 11.5 }}>Transcribing</span>
      </div>
    );
  }
  if (state === 'partial') {
    return (
      <div style={{ ...base, minWidth: 220, maxWidth: 320 }}>
        <PillDot color={R.OLIVE} size={6} />
        <span style={{
          color: 'rgba(236,231,214,0.75)', fontSize: 11.5,
          whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
          direction:'rtl', textAlign:'left', flex: 1,
        }}>...let's push the meeting to tomorrow at ten</span>
      </div>
    );
  }
  if (state === 'pasted') {
    return (
      <div style={base}>
        <span style={{ color: R.OLIVE, display:'inline-flex' }}>{I.check({ size: 12, strokeWidth: 2 })}</span>
        <span style={{ color: 'rgba(236,231,214,0.7)', fontSize: 11.5 }}>Pasted · 12 words</span>
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div style={{ ...base, borderColor: 'rgba(221,110,78,0.3)' }}>
        <span style={{ color: R.BLUSH, display:'inline-flex' }}>{I.warning({ size: 12 })}</span>
        <span style={{ color: 'rgba(236,231,214,0.7)', fontSize: 11.5 }}>Mic blocked</span>
      </div>
    );
  }
  return null;
}

// ============================================================
// DIRECTION B — CREAM (light, brand-matched)
// ============================================================
// Same 30px height. Lives on cream, looks like a printed tag.
function PillCream({ state }) {
  const H = 30;
  const base = {
    height: H,
    padding: '0 11px',
    borderRadius: H / 2,
    background: R.ELEVATED,
    color: R.INK,
    display: 'inline-flex',
    alignItems: 'center',
    gap: 9,
    border: `1px solid ${R.RULE}`,
    boxShadow: '0 4px 14px -4px rgba(20,12,4,0.18), 0 0 0 0.5px rgba(20,12,4,0.04)',
    fontFamily: 'DM Sans',
    fontSize: 12,
    fontWeight: 500,
    minWidth: 120,
  };

  if (state === 'idle') {
    return (
      <div style={base}>
        <Wave size={14} color={R.OLIVE} />
        <span style={{ color: R.MUTE, fontSize: 11.5 }}>Hold</span>
        <span className="mono" style={{
          padding: '1px 5px', background: R.PAPER,
          border: `1px solid ${R.RULE_SOFT}`, borderRadius: 4,
          fontSize: 10, letterSpacing: '0.04em', color: R.INK,
        }}>⌥ Space</span>
      </div>
    );
  }
  if (state === 'recording') {
    return (
      <div style={base}>
        <PillDot color={R.OLIVE} size={6} />
        <PillBars count={12} color={R.OLIVE_DEEP} width={54} height={12} />
        <span className="mono" style={{ fontSize: 10.5, color: R.MUTE, letterSpacing:'0.04em' }}>0:04</span>
      </div>
    );
  }
  if (state === 'transcribing') {
    return (
      <div style={base}>
        <PillSpinner color={R.OLIVE} />
        <span style={{ color: R.INK, fontSize: 11.5 }}>Transcribing</span>
      </div>
    );
  }
  if (state === 'partial') {
    return (
      <div style={{ ...base, minWidth: 220, maxWidth: 320 }}>
        <PillDot color={R.OLIVE} size={6} />
        <span className="serif-italic" style={{
          color: R.INK_SOFT, fontSize: 14,
          whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
          direction:'rtl', textAlign:'left', flex: 1,
        }}>...let's push the meeting to tomorrow</span>
      </div>
    );
  }
  if (state === 'pasted') {
    return (
      <div style={base}>
        <span style={{ color: R.OLIVE_DEEP, display:'inline-flex' }}>{I.check({ size: 12, strokeWidth: 2 })}</span>
        <span style={{ color: R.MUTE, fontSize: 11.5 }}>Pasted · 12 words</span>
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div style={{ ...base, borderColor: R.BLUSH }}>
        <span style={{ color: R.BLUSH, display:'inline-flex' }}>{I.warning({ size: 12 })}</span>
        <span style={{ color: R.MUTE, fontSize: 11.5 }}>Mic blocked</span>
      </div>
    );
  }
  return null;
}

// ============================================================
// DIRECTION C — GLASS (translucent, frosted, content-aware)
// ============================================================
// Looks like macOS Control Center / Apple Intelligence. Slightly taller
// (34px) for the rounded glassy look, but still small.
function PillGlass({ state, lightBg = true }) {
  const H = 34;
  const base = {
    height: H,
    padding: '0 12px',
    borderRadius: H / 2,
    background: lightBg ? 'rgba(255,255,255,0.55)' : 'rgba(20,12,4,0.45)',
    color: lightBg ? R.INK : R.D_TEXT,
    backdropFilter: 'blur(20px) saturate(140%)',
    WebkitBackdropFilter: 'blur(20px) saturate(140%)',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 10,
    border: `1px solid ${lightBg ? 'rgba(20,12,4,0.10)' : 'rgba(255,255,255,0.12)'}`,
    boxShadow: '0 10px 28px -8px rgba(20,12,4,0.25), 0 0 0 1px rgba(255,255,255,0.05)',
    fontFamily: 'DM Sans',
    fontSize: 13,
    fontWeight: 500,
    minWidth: 130,
  };
  const muted = lightBg ? R.MUTE : R.D_MUTE;

  if (state === 'idle') {
    return (
      <div style={base}>
        <Wave size={16} color={R.OLIVE} />
        <span style={{ color: muted, fontSize: 12 }}>Hold</span>
        <span className="mono" style={{
          padding: '2px 6px',
          background: lightBg ? 'rgba(20,12,4,0.06)' : 'rgba(255,255,255,0.08)',
          borderRadius: 4,
          fontSize: 10.5, letterSpacing: '0.04em',
        }}>⌥ Space</span>
      </div>
    );
  }
  if (state === 'recording') {
    return (
      <div style={base}>
        <PillDot color={R.OLIVE} size={7} />
        <PillBars count={14} color={lightBg ? R.OLIVE_DEEP : R.OLIVE} width={68} height={14} />
        <span className="mono" style={{ fontSize: 11, color: muted, letterSpacing:'0.04em' }}>0:04</span>
      </div>
    );
  }
  if (state === 'transcribing') {
    return (
      <div style={base}>
        <PillSpinner color={R.OLIVE} />
        <span style={{ fontSize: 12 }}>Transcribing</span>
      </div>
    );
  }
  if (state === 'partial') {
    return (
      <div style={{ ...base, minWidth: 240, maxWidth: 360 }}>
        <PillDot color={R.OLIVE} size={7} />
        <span className="serif-italic" style={{
          fontSize: 16, lineHeight: 1.05,
          whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
          direction:'rtl', textAlign:'left', flex: 1,
        }}>...let's push the meeting to tomorrow</span>
      </div>
    );
  }
  if (state === 'pasted') {
    return (
      <div style={base}>
        <span style={{ color: R.OLIVE_DEEP, display:'inline-flex' }}>{I.check({ size: 14, strokeWidth: 2.2 })}</span>
        <span style={{ fontSize: 12, color: muted }}>Pasted · 12 words to Slack</span>
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div style={{ ...base, borderColor: R.BLUSH }}>
        <span style={{ color: R.BLUSH, display:'inline-flex' }}>{I.warning({ size: 14 })}</span>
        <span style={{ fontSize: 12, color: muted }}>Mic permission needed</span>
      </div>
    );
  }
  return null;
}

// ============================================================
// PILL DISPLAY ARTBOARDS
// ============================================================
// Each direction shows all 6 states on a representative desktop backdrop.

// Convincing macOS desktop swatch (subtle gradient + soft noise)
function DesktopBg({ kind = 'cream', children }) {
  const bg =
    kind === 'cream'
      ? `linear-gradient(135deg, ${R.PAPER} 0%, ${R.CANVAS} 50%, #EFEAD8 100%)`
      : kind === 'photo'
        ? `linear-gradient(135deg, #B5A788 0%, #76654A 100%)`
        : `linear-gradient(135deg, ${R.D_INK} 0%, #2A2620 50%, #3E382D 100%)`;
  return (
    <div style={{
      width: '100%', height: '100%',
      background: bg, padding: 36, boxSizing: 'border-box',
      position: 'relative', overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      {children}
    </div>
  );
}

function StateRow({ label, children, light = true }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap: 22, paddingBottom: 14 }}>
      <div style={{
        width: 110, flexShrink: 0,
        fontFamily: 'JetBrains Mono', fontSize: 10.5,
        color: light ? R.MUTE : R.D_MUTE, letterSpacing: '0.16em', textTransform: 'uppercase',
      }}>
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}

// Direction A: STRIP — full artboard
function PillStripArtboard() {
  return (
    <DesktopBg kind="dark">
      <div style={{ position:'absolute', top: 24, left: 32, right: 32, display:'flex', justifyContent:'space-between' }}>
        <Eyebrow text="Direction A · Strip" color="rgba(236,231,214,0.6)" />
        <span className="mono" style={{ fontSize: 10.5, letterSpacing: '0.18em', color: 'rgba(236,231,214,0.5)', textTransform:'uppercase' }}>
          h 30 · solid · low-profile
        </span>
      </div>
      <div style={{ flex: 1, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 16, padding: '32px 40px',
          minWidth: 540,
        }}>
          <StateRow label="01 · idle"        light={false}><PillStrip state="idle" /></StateRow>
          <StateRow label="02 · recording"   light={false}><PillStrip state="recording" /></StateRow>
          <StateRow label="03 · streaming"   light={false}><PillStrip state="partial" /></StateRow>
          <StateRow label="04 · transcribing"light={false}><PillStrip state="transcribing" /></StateRow>
          <StateRow label="05 · pasted"      light={false}><PillStrip state="pasted" /></StateRow>
          <StateRow label="06 · error"       light={false}><PillStrip state="error" /></StateRow>
        </div>
      </div>
      <div style={{ position:'absolute', bottom: 26, left: 32, right: 32, fontSize: 12, color: 'rgba(236,231,214,0.55)', lineHeight: 1.5 }}>
        Sits unobtrusively at the bottom-center of any screen. Dark surface, low chrome, olive accents. <span style={{ color: R.OLIVE }}>Olive dot = mic open.</span>
      </div>
    </DesktopBg>
  );
}

// Direction B: CREAM
function PillCreamArtboard() {
  return (
    <DesktopBg kind="cream">
      <div style={{ position:'absolute', top: 24, left: 32, right: 32, display:'flex', justifyContent:'space-between' }}>
        <Eyebrow text="Direction B · Cream" />
        <span className="mono" style={{ fontSize: 10.5, letterSpacing: '0.18em', color: R.MUTE, textTransform:'uppercase' }}>
          h 30 · brand-matched · printed
        </span>
      </div>
      <div style={{ flex: 1, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{
          background: R.ELEVATED,
          border: `1px solid ${R.RULE}`,
          borderRadius: 16, padding: '32px 40px',
          minWidth: 540,
        }}>
          <StateRow label="01 · idle"        ><PillCream state="idle" /></StateRow>
          <StateRow label="02 · recording"   ><PillCream state="recording" /></StateRow>
          <StateRow label="03 · streaming"   ><PillCream state="partial" /></StateRow>
          <StateRow label="04 · transcribing"><PillCream state="transcribing" /></StateRow>
          <StateRow label="05 · pasted"      ><PillCream state="pasted" /></StateRow>
          <StateRow label="06 · error"       ><PillCream state="error" /></StateRow>
        </div>
      </div>
      <div style={{ position:'absolute', bottom: 26, left: 32, right: 32, fontSize: 12, color: R.INK_SOFT, lineHeight: 1.5 }}>
        Looks like a printed paper tag floating above your work. Partial transcripts set in <em className="serif-italic" style={{ fontStyle:'italic', color: R.INK }}>Instrument Serif</em> for warmth.
      </div>
    </DesktopBg>
  );
}

// Direction C: GLASS
function PillGlassArtboard() {
  return (
    <DesktopBg kind="photo">
      {/* fake desktop noise — give the glass something to actually blur */}
      <div style={{
        position:'absolute', inset: 0,
        background: `radial-gradient(circle at 20% 30%, rgba(255,255,255,0.18), transparent 40%),
                     radial-gradient(circle at 80% 70%, rgba(0,0,0,0.25), transparent 40%),
                     radial-gradient(circle at 60% 20%, rgba(216,255,180,0.12), transparent 35%)`,
      }} />
      <div style={{ position:'absolute', top: 24, left: 32, right: 32, display:'flex', justifyContent:'space-between', zIndex: 2 }}>
        <Eyebrow text="Direction C · Glass" color="rgba(255,255,255,0.85)" />
        <span className="mono" style={{ fontSize: 10.5, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.8)', textTransform:'uppercase' }}>
          h 34 · frosted · content-aware
        </span>
      </div>
      <div style={{ flex: 1, display:'flex', alignItems:'center', justifyContent:'center', position:'relative', zIndex: 1 }}>
        <div style={{
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.15)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          borderRadius: 16, padding: '32px 40px',
          minWidth: 560,
        }}>
          <StateRow label="01 · idle"        light={false}><PillGlass state="idle" /></StateRow>
          <StateRow label="02 · recording"   light={false}><PillGlass state="recording" /></StateRow>
          <StateRow label="03 · streaming"   light={false}><PillGlass state="partial" /></StateRow>
          <StateRow label="04 · transcribing"light={false}><PillGlass state="transcribing" /></StateRow>
          <StateRow label="05 · pasted"      light={false}><PillGlass state="pasted" /></StateRow>
          <StateRow label="06 · error"       light={false}><PillGlass state="error" /></StateRow>
        </div>
      </div>
      <div style={{ position:'absolute', bottom: 26, left: 32, right: 32, fontSize: 12, color: 'rgba(255,255,255,0.85)', lineHeight: 1.5, zIndex: 2 }}>
        Picks up colors from whatever's behind it — works on any wallpaper, light or dark.
      </div>
    </DesktopBg>
  );
}

// ============================================================
// COMPARISON ARTBOARD — all three directions on one row
// ============================================================
function PillComparisonArtboard() {
  return (
    <div style={{
      width: '100%', height: '100%', background: R.CANVAS,
      padding: 48, boxSizing: 'border-box', display:'flex', flexDirection:'column', gap: 28,
    }}>
      <ArtTitle
        kicker="Pill · side by side"
        title="Three small, low-profile directions"
        desc="All three target the same goal: a pill that never overshadows your work. Pick the visual language; states adapt across all three."
      />

      <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap: 18, flex: 1 }}>
        {/* A */}
        <div style={{
          background: R.D_INK, borderRadius: 14, padding: 28,
          display:'flex', flexDirection:'column', gap: 12,
          border:`1px solid ${R.RULE}`,
        }}>
          <Eyebrow text="A · Strip" color="rgba(236,231,214,0.7)" />
          <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'center', gap: 14 }}>
            <PillStrip state="idle" />
            <PillStrip state="recording" />
            <PillStrip state="pasted" />
          </div>
          <span style={{ color: 'rgba(236,231,214,0.65)', fontSize: 12, lineHeight: 1.5 }}>
            Dark, smallest. Disappears against any background.
          </span>
        </div>

        {/* B */}
        <div style={{
          background: R.PAPER, borderRadius: 14, padding: 28,
          display:'flex', flexDirection:'column', gap: 12,
          border:`1px solid ${R.RULE}`,
        }}>
          <Eyebrow text="B · Cream" />
          <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'center', gap: 14 }}>
            <PillCream state="idle" />
            <PillCream state="recording" />
            <PillCream state="pasted" />
          </div>
          <span style={{ color: R.INK_SOFT, fontSize: 12, lineHeight: 1.5 }}>
            Brand-matched paper. Most distinctive on light desktops.
          </span>
        </div>

        {/* C */}
        <div style={{
          background: `linear-gradient(135deg, #8A7965, #4A3E2E)`,
          borderRadius: 14, padding: 28,
          display:'flex', flexDirection:'column', gap: 12,
          border:`1px solid ${R.RULE}`,
        }}>
          <Eyebrow text="C · Glass" color="rgba(255,255,255,0.85)" />
          <div style={{ flex:1, display:'flex', flexDirection:'column', justifyContent:'center', gap: 14 }}>
            <PillGlass state="idle" lightBg={false} />
            <PillGlass state="recording" lightBg={false} />
            <PillGlass state="pasted" lightBg={false} />
          </div>
          <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, lineHeight: 1.5 }}>
            Frosted; adapts to wallpaper. Most expensive feeling.
          </span>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, {
  PillStrip, PillCream, PillGlass,
  PillStripArtboard, PillCreamArtboard, PillGlassArtboard, PillComparisonArtboard,
});
