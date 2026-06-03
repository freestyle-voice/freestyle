// Freestyle — Download page.
// Reuses FT / ACCENTS (fs-demo.jsx), Nav + LOGO_WAVE + GH (fs-sections.jsx).
// Smart OS detection drives a "recommended" hero; full editorial package
// listing below for macOS (Apple silicon / Intel), Windows, and Linux (many).

const DL_ACCENT_NAME = { '#6B8F12': 'olive', '#C9563B': 'blush', '#6A5890': 'plum' };

const RELEASE = { version: '1.4.2', date: 'May 2026', license: 'FSL-1.1-ALv2' };

const PLATFORMS = [
  {
    id: 'mac', name: 'macOS', glyph: 'circle',
    req: 'macOS 12 Monterey or later',
    packages: [
      { label: 'Apple silicon', sub: 'M1 · M2 · M3 · M4', ext: '.dmg', arch: 'arm64', size: '29.4 MB', rec: true },
      { label: 'Intel', sub: 'Core i-series Macs', ext: '.dmg', arch: 'x86_64', size: '31.8 MB' },
    ],
    commands: [{ label: 'Homebrew', cmd: 'brew install --cask freestyle' }],
  },
  {
    id: 'win', name: 'Windows', glyph: 'square',
    req: 'Windows 10 (1809) or later',
    packages: [
      { label: 'Installer', sub: 'Recommended for most PCs', ext: '.exe', arch: 'x64', size: '34.2 MB', rec: true },
      { label: 'Installer', sub: 'Windows on ARM', ext: '.exe', arch: 'arm64', size: '33.0 MB' },
      { label: 'Portable', sub: 'No install — runs from a folder', ext: '.zip', arch: 'x64', size: '36.7 MB' },
    ],
    commands: [{ label: 'winget', cmd: 'winget install Freestyle.Freestyle' }],
  },
  {
    id: 'linux', name: 'Linux', glyph: 'triangle',
    req: 'glibc 2.31+ · X11 or Wayland',
    packages: [
      { label: 'Debian · Ubuntu', sub: 'apt-based distros', ext: '.deb', arch: 'amd64', size: '33.1 MB', rec: true },
      { label: 'Fedora · RHEL', sub: 'dnf / yum', ext: '.rpm', arch: 'x86_64', size: '33.4 MB' },
      { label: 'AppImage', sub: 'Universal — no install', ext: '.AppImage', arch: 'x86_64', size: '48.9 MB' },
      { label: 'AppImage', sub: 'Universal — ARM', ext: '.AppImage', arch: 'aarch64', size: '47.2 MB' },
      { label: 'Tarball', sub: 'Generic binaries', ext: '.tar.gz', arch: 'x86_64', size: '38.0 MB' },
      { label: 'Tarball', sub: 'Generic binaries', ext: '.tar.gz', arch: 'aarch64', size: '36.5 MB' },
    ],
    commands: [
      { label: 'Flathub', cmd: 'flatpak install flathub io.freestyle.Freestyle' },
      { label: 'Snap', cmd: 'snap install freestyle' },
      { label: 'Arch (AUR)', cmd: 'yay -S freestyle' },
    ],
  },
];

function detectOS() {
  const ua = (navigator.userAgent || '') + ' ' + (navigator.platform || '');
  if (/Mac|iPhone|iPad|iPod/i.test(ua)) return 'mac';
  if (/Win/i.test(ua)) return 'win';
  if (/Linux|X11|CrOS/i.test(ua)) return 'linux';
  return 'unknown';
}

// ============================================================
// Small parts
// ============================================================
function Glyph({ shape, color, size = 13 }) {
  const base = { display: 'inline-block', flexShrink: 0 };
  if (shape === 'circle') return <span style={{ ...base, width: size, height: size, borderRadius: '50%', border: `2px solid ${color}` }} />;
  if (shape === 'square') return <span style={{ ...base, width: size, height: size, border: `2px solid ${color}` }} />;
  return <span style={{ ...base, width: 0, height: 0, borderLeft: `${size / 2}px solid transparent`, borderRight: `${size / 2}px solid transparent`, borderBottom: `${size}px solid ${color}` }} />;
}

const DL_ARROW = "M3 8h14M11 2v12M11 14l-4-4M11 14l4-4"; // download glyph (caret-down look handled in CSS)

function DownArrow({ stroke }) {
  return (
    <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="fs-pkg-arrow">
      <path d="M3 8h14" stroke="transparent" strokeWidth="0" />
      <path d="M10 2v11M10 13l-4-4M10 13l4-4" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 17h12" stroke={stroke} strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

// ============================================================
// HERO
// ============================================================
function DownloadHero({ accent, os }) {
  const plat = PLATFORMS.find((p) => p.id === os);
  return (
    <header style={{ padding: 'clamp(36px,6vh,72px) clamp(24px,5vw,56px) 0', maxWidth: 1080, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', maxWidth: 760, margin: '0 auto' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 15px', borderRadius: 999, border: `1px solid ${FT.rule}`, background: FT.paper, marginBottom: 26, whiteSpace: 'nowrap' }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: accent.base }} />
          <span className="mono" style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: FT.mute }}>Free · open source · {RELEASE.license}</span>
        </div>
        <h1 className="serif" style={{ margin: 0, fontWeight: 400, fontSize: 'clamp(44px,6.5vw,88px)', lineHeight: 1.04, letterSpacing: '-0.035em', color: FT.ink }}>
          Get <span className="serif-italic" style={{ color: accent.base }}>Freestyle</span>.
        </h1>
        <p style={{ margin: '24px auto 0', maxWidth: 520, fontSize: 'clamp(16px,1.6vw,19px)', lineHeight: 1.55, color: FT.inkSoft, textWrap: 'pretty' }}>
          One small app, every desktop. Pick your platform below — or grab the build we picked for you.
        </p>
      </div>
      <RecommendedCard accent={accent} plat={plat} os={os} />
    </header>
  );
}

function RecommendedCard({ accent, plat, os }) {
  // generic fallback when OS unknown
  if (!plat) {
    return (
      <div style={{ marginTop: 'clamp(34px,5vh,52px)', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 12 }}>
        {PLATFORMS.map((p) => (
          <a key={p.id} href={`#${p.id}`} className="fs-btn fs-btn-ghost" style={btnStyle()}>
            <Glyph shape={p.glyph} color={accent.base} /> {p.name}
          </a>
        ))}
      </div>
    );
  }
  const rec = plat.packages.find((pk) => pk.rec) || plat.packages[0];
  const alts = plat.packages.filter((pk) => pk !== rec);
  return (
    <div style={{
      marginTop: 'clamp(34px,5vh,52px)', position: 'relative',
      border: `1px solid ${FT.rule}`, borderRadius: 22, overflow: 'hidden',
      background: `linear-gradient(150deg, ${FT.elevated} 0%, ${FT.canvas} 58%, ${accent.soft} 130%)`,
      boxShadow: '0 30px 70px -38px rgba(20,12,4,0.4)',
    }}>
      <div className="fs-reco-grid" style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 'clamp(20px,3vw,40px)', alignItems: 'center', padding: 'clamp(28px,3.4vw,42px)' }}>
        {/* left — who/what */}
        <div>
          <div className="mono" style={{ display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 10.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: accent.deep, marginBottom: 16 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: accent.base }} />
            Detected · recommended for you
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
            <Glyph shape={plat.glyph} color={accent.base} size={20} />
            <h2 className="serif" style={{ margin: 0, fontWeight: 400, fontSize: 'clamp(32px,4vw,48px)', lineHeight: 1, letterSpacing: '-0.02em', color: FT.ink }}>
              {plat.name} <span className="serif-italic" style={{ color: accent.base }}>{rec.label}</span>
            </h2>
          </div>
          <div className="mono" style={{ marginTop: 18, fontSize: 11.5, color: FT.mute, letterSpacing: '0.03em', lineHeight: 1.9 }}>
            v{RELEASE.version} · {RELEASE.date}<br />
            {rec.ext} · {rec.arch} · {rec.size}<br />
            {plat.req}
          </div>
        </div>
        {/* right — actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <a href="#" className="fs-btn fs-btn-primary" style={{ ...btnStyle(), height: 56, fontSize: 15.5, justifyContent: 'center' }}>
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M3 8h0" stroke="transparent" />
              <path d="M10 2v11M10 13l-4-4M10 13l4-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 17h12" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
            Download for {plat.name}
          </a>
          {alts.map((pk, i) => (
            <a key={i} href="#" className="fs-btn fs-btn-ghost" style={{ ...btnStyle(), height: 46, justifyContent: 'center', fontSize: 13.5 }}>
              {pk.label} · {pk.arch} <span className="mono" style={{ fontSize: 11, color: FT.mute }}>{pk.size}</span>
            </a>
          ))}
          <a href={`#${plat.id}`} className="fs-navlink mono" style={{ alignSelf: 'center', marginTop: 4, fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: FT.mute, textDecoration: 'none' }}>
            On a different OS? See all builds ↓
          </a>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// PLATFORM BLOCKS
// ============================================================
function AllPlatforms({ accent, os }) {
  return (
    <section style={{ padding: 'clamp(48px,8vh,96px) clamp(24px,5vw,56px) 0', maxWidth: 1080, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 'clamp(8px,2vh,18px)' }}>
        <span className="mono" style={{ fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase', color: accent.deep }}>All downloads</span>
        <h2 className="serif" style={{ margin: '12px 0 0', fontWeight: 400, fontSize: 'clamp(28px,3.6vw,44px)', letterSpacing: '-0.025em', color: FT.ink }}>
          Every platform. <span className="serif-italic" style={{ color: accent.base }}>Every package.</span>
        </h2>
      </div>
      {PLATFORMS.map((p) => <PlatformBlock key={p.id} plat={p} accent={accent} detected={p.id === os} />)}
    </section>
  );
}

function PlatformBlock({ plat, accent, detected }) {
  return (
    <div id={plat.id} style={{ borderTop: `1px solid ${FT.rule}`, padding: 'clamp(34px,5vh,56px) 0' }}>
      <div className="fs-platform-grid" style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 'clamp(28px,4vw,56px)', alignItems: 'start' }}>
        {/* masthead */}
        <div style={{ position: 'sticky', top: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Glyph shape={plat.glyph} color={accent.base} size={18} />
            <h3 className="serif" style={{ margin: 0, fontWeight: 400, fontSize: 'clamp(32px,3.4vw,44px)', lineHeight: 1, letterSpacing: '-0.02em', color: FT.ink }}>{plat.name}</h3>
          </div>
          {detected && (
            <span className="mono" style={{ display: 'inline-block', marginTop: 14, padding: '3px 10px', borderRadius: 999, background: accent.soft, color: accent.ink, fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Your system</span>
          )}
          <div className="mono" style={{ marginTop: 14, fontSize: 11, color: FT.mute, letterSpacing: '0.03em', lineHeight: 1.85 }}>
            {plat.req}<br />v{RELEASE.version} · {RELEASE.date}
          </div>
        </div>
        {/* package list */}
        <div>
          <div style={{ border: `1px solid ${FT.rule}`, borderRadius: 16, overflow: 'hidden', background: FT.elevated }}>
            {plat.packages.map((pk, i) => <PackageRow key={i} pk={pk} accent={accent} first={i === 0} />)}
          </div>
          {plat.commands && (
            <div style={{ marginTop: 18 }}>
              <div className="mono" style={{ fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: FT.mute, marginBottom: 10 }}>Or install from a package manager</div>
              <div className="fs-cmd-grid" style={{ display: 'grid', gridTemplateColumns: plat.commands.length > 1 ? 'repeat(2, 1fr)' : '1fr', gap: 10 }}>
                {plat.commands.map((c, i) => <CommandBlock key={i} c={c} accent={accent} />)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PackageRow({ pk, accent, first }) {
  return (
    <a href="#" className="fs-pkg-row" style={{
      display: 'grid', gridTemplateColumns: '1fr auto 84px 44px', alignItems: 'center', gap: 16,
      padding: '17px 20px', textDecoration: 'none', color: FT.ink,
      borderTop: first ? 'none' : `1px solid ${FT.ruleSoft}`,
    }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ fontSize: 16.5, fontWeight: 500, color: FT.ink }}>{pk.label}</span>
          {pk.rec && <span className="mono" style={{ padding: '2px 8px', borderRadius: 999, background: accent.base, color: '#F4F0E4', fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Pick</span>}
        </div>
        <div className="mono" style={{ fontSize: 11, color: FT.mute, marginTop: 4, letterSpacing: '0.02em' }}>{pk.sub}</div>
      </div>
      <span className="mono fs-pkg-meta" style={{ fontSize: 11.5, color: accent.deep, letterSpacing: '0.04em', justifySelf: 'start' }}>
        {pk.ext} <span style={{ color: FT.mute }}>· {pk.arch}</span>
      </span>
      <span className="mono" style={{ fontSize: 11.5, color: FT.mute, letterSpacing: '0.02em', justifySelf: 'end' }}>{pk.size}</span>
      <span style={{
        justifySelf: 'end', width: 38, height: 38, borderRadius: 9, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: pk.rec ? FT.ink : 'transparent', border: pk.rec ? '1px solid transparent' : `1px solid ${FT.rule}`,
      }}>
        <DownArrow stroke={pk.rec ? FT.canvas : FT.ink} />
      </span>
    </a>
  );
}

function CommandBlock({ c, accent }) {
  const [copied, setCopied] = React.useState(false);
  const copy = (e) => {
    e.preventDefault();
    try { navigator.clipboard.writeText(c.cmd); } catch (_) {}
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };
  return (
    <div className="fs-cmd" onClick={copy} style={{
      border: `1px solid ${FT.rule}`, borderRadius: 11, background: FT.dInk, color: FT.dText,
      padding: '12px 14px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8,
    }} title="Click to copy">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span className="mono" style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: accent.base }}>{c.label}</span>
        <span className="mono fs-copybtn" style={{ fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: copied ? accent.base : FT.dMute }}>{copied ? 'Copied ✓' : 'Copy'}</span>
      </div>
      <code className="mono" style={{ fontSize: 12.5, color: FT.dText, letterSpacing: '0.01em', wordBreak: 'break-all', lineHeight: 1.4 }}>
        <span style={{ color: accent.base, marginRight: 8 }}>$</span>{c.cmd}
      </code>
    </div>
  );
}

// ============================================================
// FOOTER (slim — no redundant download CTA)
// ============================================================
function DownloadFooter({ accent }) {
  return (
    <footer style={{ borderTop: `1px solid ${FT.rule}`, marginTop: 'clamp(56px,9vh,110px)' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: 'clamp(40px,6vh,72px) clamp(24px,5vw,56px)', display: 'flex', flexWrap: 'wrap', gap: 28, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ maxWidth: 420 }}>
          <a href="Freestyle Landing v3.html" style={{ display: 'inline-flex', alignItems: 'center', gap: 11, textDecoration: 'none', color: FT.ink }}>
            <svg viewBox="0 0 100 100" width="26" height="26" aria-hidden="true"><polyline points={LOGO_WAVE} fill="none" stroke={accent.base} strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <span className="serif-italic" style={{ fontSize: 24 }}>freestyle<span style={{ color: accent.base }}>.</span></span>
          </a>
          <p style={{ margin: '14px 0 0', fontSize: 14.5, color: FT.mute, lineHeight: 1.55, textWrap: 'pretty' }}>
            Every download is signed and reproducible. Prefer to build it yourself? The full source is on GitHub.
          </p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
          <a href="https://github.com/freestyle-voice/freestyle/releases" target="_blank" rel="noopener" className="fs-btn fs-btn-ghost" style={btnStyle()}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={GH} /></svg>
            All releases &amp; checksums
          </a>
          <div style={{ display: 'inline-flex', gap: 22, flexWrap: 'wrap' }}>
            {[['Docs', '#'], ['Changelog', '#'], ['Discord', 'https://discord.gg/Fmgt5yZCDu']].map(([t, h]) => (
              <a key={t} href={h} target={h.startsWith('http') ? '_blank' : undefined} rel="noopener" className="fs-navlink" style={{ fontSize: 14, color: FT.mute, textDecoration: 'none' }}>{t}</a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

function btnStyle() {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 10, height: 50, padding: '0 22px',
    borderRadius: 10, fontSize: 14.5, fontWeight: 500, textDecoration: 'none', cursor: 'pointer',
  };
}

// ============================================================
// APP
// ============================================================
function DownloadApp() {
  const [t, setTweak] = useTweaks({ accent: '#6B8F12' });
  const accentName = DL_ACCENT_NAME[t.accent] || 'olive';
  const accent = ACCENTS[accentName];
  const [os, setOs] = React.useState('unknown');
  React.useEffect(() => { setOs(detectOS()); }, []);

  return (
    <div id="top" style={{
      '--accent': accent.base, '--accent-deep': accent.deep, '--accent-soft': accent.soft,
      '--ink': FT.ink, '--canvas': FT.canvas,
      background: FT.canvas, minHeight: '100vh',
    }}>
      <Nav accent={accent} />
      <DownloadHero accent={accent} os={os} />
      <AllPlatforms accent={accent} os={os} />
      <DownloadFooter accent={accent} />

      <TweaksPanel>
        <TweakSection label="Theme" />
        <TweakColor label="Accent" value={t.accent}
          options={['#6B8F12', '#C9563B', '#6A5890']}
          onChange={(v) => setTweak('accent', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<DownloadApp />);
