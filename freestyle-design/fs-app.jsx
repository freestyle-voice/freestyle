// Freestyle landing — app shell. Assembles sections + interactive demo,
// wires the Tweaks panel (staging + accent).

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "staging": "home",
  "accent": "#6B8F12"
}/*EDITMODE-END*/;

const ACCENT_NAME = { '#6B8F12': 'olive', '#C9563B': 'blush', '#6A5890': 'plum' };

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const accentName = ACCENT_NAME[t.accent] || 'olive';
  const accent = ACCENTS[accentName];

  const stageLabel = { home: 'Home', editor: 'Notepad', editorial: 'Editorial' };
  const stageKey = { Home: 'home', Notepad: 'editor', Editorial: 'editorial' };

  return (
    <div id="top" style={{
      '--accent': accent.base, '--accent-deep': accent.deep,
      '--ink': FT.ink, '--canvas': FT.canvas,
      background: FT.canvas, minHeight: '100vh',
    }}>
      <Nav accent={accent} />
      <Hero accent={accent} />
      <DemoSection accent={accent} staging={t.staging} accentName={accentName} />
      <CapabilitiesSection accent={accent} />
      <FooterCTA accent={accent} />

      <TweaksPanel>
        <TweakSection label="Product demo" />
        <TweakRadio label="Staging" value={stageLabel[t.staging] || 'Home'}
          options={['Home', 'Notepad', 'Editorial']}
          onChange={(v) => setTweak('staging', stageKey[v])} />
        <TweakSection label="Theme" />
        <TweakColor label="Accent" value={t.accent}
          options={['#6B8F12', '#C9563B', '#6A5890']}
          onChange={(v) => setTweak('accent', v)} />
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
