// Freestyle landing — the demo assembled three ways (staging variants).
// Shares one state machine; only the framing differs.

function FreestyleDemo({ staging = 'editor', accentName = 'olive' }) {
  const accent = ACCENTS[accentName] || ACCENTS.olive;
  const { phase, typed, elapsed, press, release } = useDemoMachine(DEMO_TEXT, accent);
  const recording = phase === 'recording';

  // hold-to-talk via Space when pointer is over the demo
  const hostRef = React.useRef(null);
  const hovering = React.useRef(false);
  const held = React.useRef(false);
  React.useEffect(() => {
    const down = (e) => {
      if (e.code === 'Space' && hovering.current && !held.current && !e.repeat) {
        e.preventDefault(); held.current = true; press();
      }
    };
    const up = (e) => {
      if (e.code === 'Space' && held.current) { e.preventDefault(); held.current = false; release(); }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [press, release]);

  const common = {
    ref: hostRef,
    onMouseEnter: () => { hovering.current = true; },
    onMouseLeave: () => { hovering.current = false; },
  };

  if (staging === 'home') return <div {...common}><StageHome {...{ phase, typed, elapsed, accent, press, release }} /></div>;
  if (staging === 'desktop')  return <div {...common}><StageDesktop {...{ phase, typed, elapsed, accent, press, release }} /></div>;
  if (staging === 'editorial') return <div {...common}><StageEditorial {...{ phase, typed, elapsed, accent, press, release, recording }} /></div>;
  return <div {...common}><StageEditor {...{ phase, typed, elapsed, accent, press, release, recording }} /></div>;
}

// shared control strip: fn keycap + wave + status
function ControlStrip({ phase, elapsed, accent, press, release, hint = true }) {
  const recording = phase === 'recording';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 22, width: '100%',
      background: FT.paper, border: `1px solid ${FT.rule}`, borderRadius: 14, padding: '16px 20px',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <FnKey pressed={recording} accent={accent} size={56} onHoldStart={press} onHoldEnd={release} />
        {hint && <span className="mono" style={{ fontSize: 9, letterSpacing: '0.14em', color: FT.mute, textTransform: 'uppercase' }}>hold</span>}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <StatusChip phase={phase} elapsed={elapsed} accent={accent} />
        <div style={{
          background: recording ? accent.soft : FT.elevated,
          border: `1px solid ${recording ? accent.base : FT.ruleSoft}`,
          borderRadius: 10, padding: '8px 14px', transition: 'all 0.25s ease',
        }}>
          <VoiceWave active={recording} accent={accent} height={40} />
        </div>
      </div>
    </div>
  );
}

// ---- A · Editor (default) ----
function StageEditor({ phase, typed, elapsed, accent, press, release, recording }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 620, margin: '0 auto' }}>
      <NotesEditor typed={typed} phase={phase} accent={accent} />
      <ControlStrip {...{ phase, elapsed, accent, press, release, recording }} />
    </div>
  );
}

// ---- B · Desktop (notes window on a wallpaper, floating pill overlay) ----
function StageDesktop({ phase, typed, elapsed, accent, press, release }) {
  const recording = phase === 'recording';
  return (
    <div style={{
      position: 'relative', borderRadius: 20, overflow: 'hidden',
      border: `1px solid ${FT.rule}`, maxWidth: 760, margin: '0 auto',
      background: `linear-gradient(150deg, ${FT.paper} 0%, ${FT.canvas} 45%, #EBE5D2 100%)`,
      boxShadow: '0 30px 70px -34px rgba(20,12,4,0.4)',
      padding: '46px 56px 78px',
    }}>
      {/* faint desktop texture */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.5, pointerEvents: 'none',
        background: `radial-gradient(circle at 18% 22%, ${accent.soft}88, transparent 42%), radial-gradient(circle at 84% 78%, rgba(20,12,4,0.05), transparent 45%)`,
      }} />
      <div style={{ position: 'relative', maxWidth: 540, margin: '0 auto' }}>
        <NotesEditor typed={typed} phase={phase} accent={accent} compact />
      </div>
      {/* floating pill, fixed bottom-center — clickable as fn */}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 22, display: 'flex', justifyContent: 'center', zIndex: 2 }}>
        <span
          onMouseDown={(e) => { e.preventDefault(); press(); }}
          onMouseUp={release} onMouseLeave={release}
          style={{ cursor: 'pointer', WebkitUserSelect: 'none', userSelect: 'none' }}
          title="Hold to dictate">
          <FloatingPill phase={phase} elapsed={elapsed} accent={accent} />
        </span>
      </div>
    </div>
  );
}

// ---- C · Editorial (two columns: instruction + editor) ----
function StageEditorial({ phase, typed, elapsed, accent, press, release }) {
  const recording = phase === 'recording';
  const StepWord = ({ on, children }) => (
    <span className="serif-italic" style={{ color: on ? accent.base : FT.mute, transition: 'color 0.25s ease' }}>{children}</span>
  );
  return (
    <div className="fs-editorial-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40, alignItems: 'center', maxWidth: 980, margin: '0 auto' }}>
      {/* left — instruction */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div className="serif" style={{ fontSize: 'clamp(30px,3.4vw,46px)', lineHeight: 1.12, color: FT.ink, letterSpacing: '-0.02em' }}>
          <StepWord on={phase === 'idle'}>Press</StepWord>{' '}
          <span style={{ display: 'inline-block', verticalAlign: 'middle', margin: '0 8px' }}>
            <FnKey pressed={recording} accent={accent} size={52} onHoldStart={press} onHoldEnd={release} />
          </span>
          <StepWord on={recording || phase === 'transcribing'}>speak,</StepWord>{' '}
          <StepWord on={phase === 'typing' || phase === 'done'}>release.</StepWord>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
          <span onMouseDown={(e) => { e.preventDefault(); press(); }} onMouseUp={release} onMouseLeave={release}
            style={{ cursor: 'pointer', WebkitUserSelect: 'none', userSelect: 'none' }} title="Hold to dictate">
            <FloatingPill phase={phase} elapsed={elapsed} accent={accent} size={48} />
          </span>
        </div>
        <p style={{ margin: 0, fontSize: 14, color: FT.mute, lineHeight: 1.5 }}>
          Hold the key, talk, let go. Clean text lands wherever your cursor is — here, in Notes.
        </p>
      </div>
      {/* right — editor */}
      <NotesEditor typed={typed} phase={phase} accent={accent} />
    </div>
  );
}

Object.assign(window, { FreestyleDemo, StageEditor, StageDesktop, StageEditorial, ControlStrip });
