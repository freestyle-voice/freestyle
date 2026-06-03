// Freestyle — App redesign: window shells & sidebar variants & settings
// layout pattern explorations.

// ============================================================
// SIDEBAR — DIRECTION A · Refined current
// ============================================================
// ============================================================
// SIDEBAR — Canonical (used everywhere)
// ============================================================
function SidebarA({ active = 'settings' }) {
  const items = [
    { id: 'today',      label: 'Today',      icon: I.book,     k: '1' },
    { id: 'history',    label: 'History',    icon: I.clock,    k: '2' },
    { id: 'dictionary', label: 'Dictionary', icon: I.book,     k: '3' },
    { id: 'formats',    label: 'Formats',    icon: I.fileText, k: '4' },
    { id: 'models',     label: 'Models',     icon: I.cpu,      k: '5' },
    { id: 'settings',   label: 'Settings',   icon: I.sliders,  k: '6' },
    { id: 'feedback',   label: 'Feedback',   icon: I.message,  k: '7' },
  ];
  return (
    <aside style={{
      width: 220, background: R.PAPER, borderRight: `1px solid ${R.RULE}`,
      display:'flex', flexDirection:'column', flexShrink: 0,
    }}>
      <div style={{ padding: '18px 14px 22px', display:'flex', alignItems:'center', gap: 10 }}>
        <Brand size={18} />
      </div>
      <div style={{ padding: '0 12px 8px' }}>
        <div style={{ display:'flex', flexDirection:'column', gap: 1 }}>
          {items.map(it => {
            const on = it.id === active;
            return (
              <div key={it.id} style={{
                display:'flex', alignItems:'center', gap: 10, padding: '7px 10px',
                borderRadius: 7, fontSize: 13,
                color: on ? R.INK : R.INK_SOFT,
                background: on ? R.ELEVATED : 'transparent',
                border: on ? `1px solid ${R.RULE}` : '1px solid transparent',
                fontWeight: on ? 500 : 400,
                cursor: 'default',
              }}>
                <span style={{ color: on ? R.OLIVE : R.MUTE, display:'inline-flex' }}>{it.icon({ size: 14 })}</span>
                <span style={{ flex: 1 }}>{it.label}</span>
                <span className="mono" style={{ fontSize: 9.5, color: R.MUTE, opacity: 0.6 }}>⌘{it.k}</span>
              </div>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

// ============================================================
// SIDEBAR — DIRECTION B · Editorial
// ============================================================
// Wider, no borders on items, italic serif group labels.
function SidebarB({ active = 'general' }) {
  const items = [
    { id: 'settings',   label: 'Settings' },
    { id: 'models',     label: 'Models' },
    { id: 'dictionary', label: 'Dictionary' },
    { id: 'formats',    label: 'Formats' },
    { id: 'history',    label: 'History' },
    { id: 'feedback',   label: 'Feedback' },
  ];
  return (
    <aside style={{
      width: 240, background: R.CANVAS, borderRight: `1px solid ${R.RULE}`,
      display:'flex', flexDirection:'column', flexShrink: 0,
    }}>
      <div style={{ padding: '24px 24px 32px' }}>
        <Brand size={20} />
      </div>
      <div style={{ padding: '0 16px' }}>
        <div className="serif-italic" style={{ fontSize: 18, color: R.INK, padding: '0 8px 14px', borderBottom: `1px solid ${R.RULE}`, marginBottom: 8 }}>
          Preferences
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap: 0 }}>
          {items.map((it, i) => {
            const on = it.id === active;
            return (
              <div key={it.id} style={{
                display:'flex', alignItems:'center', gap: 10, padding: '10px 8px',
                fontSize: 14, color: on ? R.INK : R.INK_SOFT,
                fontWeight: on ? 500 : 400,
                borderLeft: on ? `2px solid ${R.OLIVE}` : '2px solid transparent',
                paddingLeft: 12,
                cursor: 'default',
              }}>
                <span className="mono" style={{ fontSize: 9.5, color: R.MUTE, width: 18 }}>0{i+1}</span>
                <span style={{ flex: 1 }}>{it.label}</span>
                {on && <span style={{ width: 5, height: 5, borderRadius: '50%', background: R.OLIVE }} />}
              </div>
            );
          })}
        </div>
      </div>
      <div style={{ marginTop: 'auto', padding: '16px 24px 22px' }}>
        <div className="mono" style={{ fontSize: 10, color: R.MUTE, letterSpacing: '0.16em', textTransform:'uppercase' }}>
          Active
        </div>
        <div className="serif-italic" style={{ fontSize: 18, color: R.INK, marginTop: 4 }}>
          gpt-4o-mini
        </div>
        <div style={{ display:'flex', alignItems:'center', gap: 6, marginTop: 4, fontSize: 11.5, color: R.MUTE }}>
          via OpenAI
          <span style={{ width: 4, height: 4, borderRadius:'50%', background: R.MUTE, opacity: 0.6 }} />
          <span style={{ color: R.OLIVE }}>ready</span>
        </div>
      </div>
    </aside>
  );
}

// ============================================================
// SHARED PRIMITIVES used across settings patterns
// ============================================================
function PageHeader({ title, subtitle }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h1 className="serif" style={{
        margin: 0, fontSize: 48, lineHeight: 0.95, letterSpacing: '-0.025em', color: R.INK,
        fontWeight: 400,
      }}>{title.split('|').map((s, i) =>
        i === 1
          ? <span key={i} className="serif-italic" style={{ color: R.OLIVE }}>{s}</span>
          : <span key={i}>{s}</span>
      )}</h1>
      {subtitle && (
        <p style={{ margin: '10px 0 0', fontSize: 14, color: R.MUTE, lineHeight: 1.5, maxWidth: 580 }}>
          {subtitle}
        </p>
      )}
    </div>
  );
}

function Hotkey({ keys, dark = false }) {
  return (
    <div style={{ display:'inline-flex', alignItems:'center', gap: 5 }}>
      {keys.map((k, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span style={{ fontSize: 10, color: R.MUTE, opacity: 0.5 }}>+</span>}
          <Kbd dark={dark} big>{k}</Kbd>
        </React.Fragment>
      ))}
    </div>
  );
}

function Toggle({ on, big = false }) {
  const w = big ? 40 : 32; const h = big ? 22 : 18; const knob = big ? 18 : 14;
  return (
    <div style={{
      width: w, height: h, borderRadius: 999,
      background: on ? R.OLIVE : R.PAPER,
      border: `1px solid ${on ? R.OLIVE_DEEP : R.RULE}`,
      position: 'relative', flexShrink: 0,
    }}>
      <div style={{
        width: knob, height: knob, borderRadius: '50%',
        background: on ? R.CANVAS : R.MUTE,
        position: 'absolute', top: 1, left: on ? w - knob - 3 : 2,
      }} />
    </div>
  );
}

function Segment({ options, active, compact = false }) {
  return (
    <div style={{
      display:'inline-flex', background: R.PAPER, padding: 3, borderRadius: 9,
      border: `1px solid ${R.RULE}`, gap: 2,
    }}>
      {options.map(o => {
        const isOn = o.id === active;
        return (
          <div key={o.id} style={{
            background: isOn ? R.ELEVATED : 'transparent',
            border: isOn ? `1px solid ${R.RULE}` : '1px solid transparent',
            padding: compact ? '4px 10px' : '6px 12px', borderRadius: 6,
            display:'flex', alignItems:'center', gap: 6,
            boxShadow: isOn ? '0 1px 2px rgba(20,12,4,0.04)' : 'none',
            fontSize: 12.5, fontWeight: isOn ? 500 : 400,
            color: isOn ? R.INK : R.INK_SOFT,
          }}>
            {o.icon && <span style={{ color: isOn ? R.OLIVE : R.MUTE, display:'inline-flex' }}>{o.icon({ size: 13 })}</span>}
            {o.label}
          </div>
        );
      })}
    </div>
  );
}

function Dropdown({ value, icon, width = 'auto' }) {
  return (
    <div style={{
      display:'inline-flex', alignItems:'center', gap: 8,
      padding: '7px 11px', background: R.ELEVATED, border: `1px solid ${R.RULE}`,
      borderRadius: 8, fontSize: 13, color: R.INK, width,
      justifyContent:'space-between', cursor:'default',
    }}>
      <div style={{ display:'flex', alignItems:'center', gap: 8 }}>
        {icon && <span style={{ color: R.MUTE, display:'inline-flex' }}>{icon({ size: 14 })}</span>}
        <span>{value}</span>
      </div>
      <span style={{ color: R.MUTE, display:'inline-flex' }}>{I.chevD({ size: 12 })}</span>
    </div>
  );
}

const Btn = ({ kind = 'primary', children, icon }) => {
  const styles = {
    primary: { background: R.INK, color: R.CANVAS, border: 'none' },
    ghost:   { background: 'transparent', color: R.INK_SOFT, border: `1px solid ${R.RULE}` },
    olive:   { background: R.OLIVE, color: R.CANVAS, border: 'none' },
    danger:  { background: 'transparent', color: R.BLUSH, border: `1px solid rgba(221,110,78,0.3)` },
  };
  return (
    <button style={{
      ...styles[kind], padding: '7px 12px', borderRadius: 7,
      fontSize: 12.5, fontFamily: 'inherit', cursor: 'pointer',
      display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 500,
    }}>
      {icon && <span style={{ display:'inline-flex' }}>{icon({ size: 13 })}</span>}
      {children}
    </button>
  );
};

Object.assign(window, {
  SidebarA, SidebarB,
  PageHeader, Hotkey, Toggle, Segment, Dropdown, Btn,
});
