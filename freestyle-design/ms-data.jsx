// Models page redesign — data + icons + tokens.
// Grounded in apps/electron/.../settings/models.tsx + globals.css (light theme).
// Exposed to other babel scripts via window (see bottom).

// ---- exact app theme (globals.css :root, light) ----
const T = {
  bg: '#F4F0E4', fg: '#16140F',
  card: '#FBF8EE', cardFg: '#16140F',
  primary: '#6B8F12', primaryFg: '#FBF8EE',
  secondary: '#ECE7D6', secondaryFg: '#34302A',
  muted: '#ECE7D6', mutedFg: '#7B7461',
  accent: '#E8EFC9', accentFg: '#2E3F05',
  destructive: '#DD6E4E',
  border: '#D6CDB8', input: '#E3DCC8', ring: '#6B8F12',
  plum: '#5E4E78',
  radius: 10,
};

function fmtBytes(b) {
  if (b < 1e6) return `${Math.round(b / 1e3)} KB`;
  if (b < 1e9) return `${Math.round(b / 1e6)} MB`;
  return `${(b / 1e9).toFixed(1)} GB`;
}

// ---- voice options: on-device (whisper.cpp) + cloud, unified ----
// local status: 'ready' | 'not_downloaded' | 'downloading'
const LOCAL_VOICE = [
  { id: 'local-whisper/base.en', kind: 'local', provider: 'On-device', name: 'Whisper Base',
    size: 142e6, ram: '0.5 GB', speed: 4, quality: 2, quantized: false, status: 'ready', note: 'Great everyday pick' },
  { id: 'local-whisper/small.en', kind: 'local', provider: 'On-device', name: 'Whisper Small',
    size: 466e6, ram: '1.0 GB', speed: 3, quality: 3, quantized: false, status: 'not_downloaded' },
  { id: 'local-whisper/large-v3-turbo', kind: 'local', provider: 'On-device', name: 'Whisper Large v3 Turbo',
    size: 1.6e9, ram: '2.0 GB', speed: 3, quality: 4, quantized: true, status: 'not_downloaded', note: 'Best quality, still fast' },
  { id: 'local-whisper/tiny.en', kind: 'local', provider: 'On-device', name: 'Whisper Tiny',
    size: 75e6, ram: '0.4 GB', speed: 5, quality: 1, quantized: false, status: 'not_downloaded' },
];

const CLOUD_VOICE = [
  { id: 'groq/whisper-large-v3-turbo', kind: 'cloud', provider: 'Groq', name: 'whisper-large-v3-turbo',
    cost: 0.04, speed: 5, quality: 3, streaming: true, hasKey: true, note: 'Fastest · cheapest' },
  { id: 'openai/gpt-4o-transcribe', kind: 'cloud', provider: 'OpenAI', name: 'gpt-4o-transcribe',
    cost: 0.18, speed: 3, quality: 5, streaming: false, hasKey: true, note: 'Most accurate' },
  { id: 'deepgram/nova-3', kind: 'cloud', provider: 'Deepgram', name: 'nova-3',
    cost: 0.26, speed: 4, quality: 4, streaming: true, hasKey: false, note: 'Low-latency streaming' },
  { id: 'elevenlabs/scribe-v1', kind: 'cloud', provider: 'ElevenLabs', name: 'scribe-v1',
    cost: 0.40, speed: 3, quality: 4, streaming: false, hasKey: false, note: '99 languages' },
];

const ALL_VOICE = [...LOCAL_VOICE, ...CLOUD_VOICE];

const LLM_CLEANUP = [
  { id: 'groq/llama-3.3-70b', provider: 'Groq', name: 'llama-3.3-70b', cost: 0.05, hasKey: true },
  { id: 'openai/gpt-4o-mini', provider: 'OpenAI', name: 'gpt-4o-mini', cost: 0.15, hasKey: true },
  { id: 'anthropic/claude-haiku', provider: 'Anthropic', name: 'claude-haiku-4', cost: 0.20, hasKey: false },
  { id: 'local-llm/llama3.1', provider: 'On-device', name: 'llama3.1 · Ollama', cost: 0, hasKey: true, kind: 'local' },
];

const PROVIDERS = [
  { id: 'groq', name: 'Groq', key: 'gsk_••••••••4f2a', models: 2 },
  { id: 'openai', name: 'OpenAI', key: 'sk-••••••••9c1b', models: 3 },
  { id: 'local-whisper', name: 'On-device · whisper.cpp', key: null, models: 1, local: true },
];

// ---- inline icons (lucide-matched, 1.7 stroke) ----
function Ic({ d, fill, size = 15, sw = 1.7, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill || 'none'}
      stroke={fill ? 'none' : 'currentColor'} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round"
      style={{ flexShrink: 0, ...style }} aria-hidden="true">
      {Array.isArray(d) ? d.map((p, i) => <path key={i} d={p} />) : <path d={d} />}
    </svg>
  );
}
const ICONS = {
  mic: 'M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v3',
  sparkles: 'M12 3l1.9 4.8L18.7 9l-4.8 1.9L12 15.7 10.1 10.9 5.3 9l4.8-1.2zM19 14l.8 2 .2.8.8.2 2 .8-2 .8-.8.2-.2.8L19 22M5 3l.6 1.6L7 5.2 5.6 5.8 5 7.4 4.4 5.8 3 5.2l1.4-.6z',
  shield: 'M12 2l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V5l8-3z',
  cpu: ['M6 6h12v12H6z', 'M9 9h6v6H9zM9 1v3M15 1v3M9 20v3M15 20v3M1 9h3M1 15h3M20 9h3M20 15h3'],
  cloud: 'M17.5 19a4.5 4.5 0 0 0 .5-8.98A6 6 0 0 0 6.34 9.5 4 4 0 0 0 7 17.5h10.5z',
  download: 'M12 3v12M8 11l4 4 4-4M4 19h16',
  check: 'M5 12l5 5L20 6',
  search: ['M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z', 'M20 20l-3.5-3.5'],
  zap: 'M13 2L4 14h7l-1 8 9-12h-7l1-8z',
  target: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z', 'M12 11.5a.5.5 0 1 0 0 1 .5.5 0 0 0 0-1z'],
  coin: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 7v10M14.5 9.2c0-1-1.1-1.7-2.5-1.7s-2.5.7-2.5 1.7 1.1 1.5 2.5 1.7 2.5.8 2.5 1.8-1.1 1.7-2.5 1.7-2.5-.7-2.5-1.7'],
  x: 'M6 6l12 12M18 6L6 18',
  chevron: 'M9 6l6 6-6 6',
  refresh: ['M21 8a9 9 0 0 0-15.5-3L3 7', 'M3 4v3h3', 'M3 16a9 9 0 0 0 15.5 3L21 17', 'M21 20v-3h-3'],
  wifi: ['M5 12.5a10 10 0 0 1 14 0', 'M8.5 16a5 5 0 0 1 7 0', 'M12 19.5h.01'],
  wifiOff: ['M2 8.8a15 15 0 0 1 4-2.4M9 4.6a15 15 0 0 1 13 4.2M5 12.5a10 10 0 0 1 5-2.7M15 10.2a10 10 0 0 1 4 2.3M8.5 16a5 5 0 0 1 6-.8M12 19.5h.01', 'M2 2l20 20'],
  plus: 'M12 5v14M5 12h14',
  trash: ['M4 7h16', 'M9 7V4h6v3M6 7l1 13h10l1-13'],
  key: ['M14 9a4 4 0 1 0-3.5 3.95L11 14h2v2h2v2h3l2-2-5.5-5.5A4 4 0 0 0 14 9z'],
};
function Icon({ name, ...rest }) { return <Ic d={ICONS[name]} {...rest} />; }

Object.assign(window, {
  T, fmtBytes, LOCAL_VOICE, CLOUD_VOICE, ALL_VOICE, LLM_CLEANUP, PROVIDERS, Icon,
});
