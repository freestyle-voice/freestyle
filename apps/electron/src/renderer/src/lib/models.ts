export interface AvailableModel {
  provider_id: string;
  provider_name: string;
  model_id: string;
  model_name: string;
  family?: string;
  type: "voice" | "llm";
}

export interface WhisperModelDef {
  id: string;
  displayName: string;
  sizeBytes: number;
  ramRequired: string;
  speed: string;
  quality: string;
  quantized: boolean;
}

export interface WhisperModelDownloadState {
  model: string;
  fileName?: string;
  sizeBytes?: number;
  displayName?: string;
  status: "not_downloaded" | "downloading" | "verifying" | "ready" | "error";
  phase?: "building_binary" | "downloading_model";
  downloadProgress?: {
    bytesDownloaded: number;
    bytesTotal: number;
    percent: number;
    speedBps: number;
  };
  error?: string;
}

export interface WhisperStatus {
  binaryAvailable: boolean;
  binaryDownloading: boolean;
  serverBinaryAvailable: boolean;
  serverRunning: boolean;
  serverFailed: boolean;
  modelsDir: string;
  models: WhisperModelDownloadState[];
  modelDefinitions: WhisperModelDef[];
}

export interface MlxAsrStatus {
  platformSupported: boolean;
  pythonAvailable: boolean;
  pythonPath: string | null;
  workerPath: string | null;
  mlxAudioInstalled: boolean;
  canRun: boolean;
  blockedReason: string | null;
  serverRunning: boolean;
  serverFailed: boolean;
  keepAliveMinutes: number;
  runtime?: {
    available: boolean;
    downloading: boolean;
    url: string | null;
    downloadProgress?: WhisperModelDownloadState["downloadProgress"];
    error?: string;
  };
  models: WhisperModelDownloadState[];
  modelDefinitions: WhisperModelDef[];
  setupHint: string | null;
}

export const CLOUD_VOICE_PROVIDERS = [
  "openai",
  "groq",
  "deepgram",
  "elevenlabs",
];

export const VOICE_PROVIDERS = [
  ...CLOUD_VOICE_PROVIDERS,
  "local-whisper",
  "local-mlx",
];

export const LLM_PROVIDERS = [
  "openai",
  "anthropic",
  "google",
  "groq",
  "mistral",
  "local-llm",
];

export const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  groq: "Groq",
  deepgram: "Deepgram",
  elevenlabs: "ElevenLabs",
  mistral: "Mistral",
  openrouter: "OpenRouter",
  "local-llm": "Local LLM",
  "local-whisper": "Local Whisper",
  "local-mlx": "Local MLX",
};

export function displayProviderName(
  providerId: string,
  fallback?: string,
): string {
  return PROVIDER_DISPLAY_NAMES[providerId] ?? fallback ?? providerId;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(0)} KB`;
  if (bytes < 1_000_000_000) return `${(bytes / 1_000_000).toFixed(0)} MB`;
  return `${(bytes / 1_000_000_000).toFixed(1)} GB`;
}

export function formatSpeed(bps: number): string {
  if (bps < 1_000_000) return `${(bps / 1_000).toFixed(0)} KB/s`;
  return `${(bps / 1_000_000).toFixed(1)} MB/s`;
}

export interface VoiceItem {
  key: string;
  kind: "local" | "cloud";
  /** Which on-device engine powers this row (whisper.cpp vs MLX). */
  localEngine?: "whisper" | "mlx";
  name: string;
  provider: string;
  modelId: string;
  speed?: number;
  quality?: number;
  quantized?: boolean;
  note?: string;
  selected: boolean;
  defId?: string;
  sizeBytes?: number;
  ram?: string;
  state?: WhisperModelDownloadState;
  status?: WhisperModelDownloadState["status"];
  cost?: number;
  streaming?: boolean;
  hasKey?: boolean;
  available?: AvailableModel;
}

export const VOICE_META: Record<
  string,
  {
    speed: number;
    quality: number;
    cost?: number;
    streaming?: boolean;
    note?: string;
  }
> = {
  "groq/whisper-large-v3-turbo": {
    speed: 5,
    quality: 3,
    cost: 0.04,
    streaming: true,
    note: "Fastest \u00b7 cheapest",
  },
  "openai/gpt-4o-transcribe": {
    speed: 3,
    quality: 5,
    cost: 0.18,
    note: "Most accurate",
  },
  "openai/gpt-4o-mini-transcribe": { speed: 4, quality: 4, cost: 0.12 },
  "openai/whisper-1": { speed: 3, quality: 3, cost: 0.06 },
  "deepgram/nova-3": {
    speed: 4,
    quality: 4,
    cost: 0.26,
    streaming: true,
    note: "Low-latency streaming",
  },
  "deepgram/nova-2": { speed: 4, quality: 3, cost: 0.22, streaming: true },
  "elevenlabs/scribe_v1": {
    speed: 3,
    quality: 4,
    cost: 0.4,
    note: "99 languages",
  },
  "elevenlabs/scribe_v2": { speed: 3, quality: 4, cost: 0.4 },
  "elevenlabs/scribe_v2_realtime": {
    speed: 4,
    quality: 4,
    cost: 0.4,
    streaming: true,
  },
};

export const SPEED_RANK: Record<string, number> = {
  Fastest: 5,
  "Very Fast": 5,
  Fast: 4,
  Medium: 3,
  Slow: 2,
};

export const QUALITY_RANK: Record<string, number> = {
  Basic: 1,
  Good: 2,
  Better: 3,
  High: 4,
  Best: 5,
};

export const LOCAL_VOICE_NOTES: Record<string, string> = {
  base: "Great everyday pick",
  "base-q5_1": "Great everyday pick, smaller",
  large: "Best quality, still fast",
  "medium-q5_0": "High quality, modest size",
  "qwen3-0.6b-5bit": "Fast · great for low memory",
  "qwen3-0.6b-8bit": "Balanced quality and size",
  "qwen3-1.7b-8bit": "Best Qwen accuracy",
};

export function buildVoiceItems(
  available: AvailableModel[],
  whisperStatus: WhisperStatus | null,
  mlxStatus: MlxAsrStatus | null,
  ctx: {
    selectedModelId?: string;
    selectedProvider?: string;
    selectedWhisperModelId?: string;
    selectedMlxModelId?: string;
    keyProviders: Set<string>;
  },
): VoiceItem[] {
  const whisperLocal: VoiceItem[] = (whisperStatus?.modelDefinitions ?? []).map(
    (def) => {
      const state = whisperStatus?.models.find((m) => m.model === def.id);
      const modelId = `local-whisper/${def.id}`;
      return {
        key: modelId,
        kind: "local",
        localEngine: "whisper",
        name: `Whisper ${def.displayName}`,
        provider: "On-device",
        modelId,
        speed: SPEED_RANK[def.speed] ?? 3,
        quality: QUALITY_RANK[def.quality] ?? 3,
        quantized: def.quantized,
        note: LOCAL_VOICE_NOTES[def.id],
        defId: def.id,
        sizeBytes: def.sizeBytes,
        ram: def.ramRequired,
        state,
        status: state?.status ?? "not_downloaded",
        selected:
          ctx.selectedWhisperModelId === def.id ||
          (ctx.selectedProvider === "local-whisper" &&
            ctx.selectedModelId === modelId),
      };
    },
  );

  const mlxLocal: VoiceItem[] =
    mlxStatus?.platformSupported === false
      ? []
      : (mlxStatus?.modelDefinitions ?? []).map((def) => {
          const modelId = `local-mlx/${def.id}`;
          const canRun = mlxStatus?.canRun ?? false;
          const state = mlxStatus?.models?.find((m) => m.model === def.id);
          const fallbackState: WhisperModelDownloadState | undefined = canRun
            ? {
                model: def.id,
                sizeBytes: def.sizeBytes,
                displayName: def.displayName,
                status: "not_downloaded",
              }
            : {
                model: def.id,
                sizeBytes: def.sizeBytes,
                displayName: def.displayName,
                status: "error" as const,
                error:
                  mlxStatus?.blockedReason ??
                  mlxStatus?.setupHint ??
                  "MLX setup required",
              };
          const resolvedState = state ?? fallbackState;
          return {
            key: modelId,
            kind: "local",
            localEngine: "mlx",
            name: def.displayName,
            provider: "On-device · MLX",
            modelId,
            speed: SPEED_RANK[def.speed] ?? 4,
            quality: QUALITY_RANK[def.quality] ?? 4,
            quantized: def.quantized,
            note: canRun ? (LOCAL_VOICE_NOTES[def.id] ?? undefined) : undefined,
            defId: def.id,
            sizeBytes: def.sizeBytes,
            ram: def.ramRequired,
            status: resolvedState?.status ?? "not_downloaded",
            state: resolvedState,
            selected:
              ctx.selectedMlxModelId === def.id ||
              (ctx.selectedProvider === "local-mlx" &&
                ctx.selectedModelId === modelId),
          };
        });

  const seen = new Set<string>();
  const cloud: VoiceItem[] = [];
  for (const m of available) {
    if (m.type !== "voice") continue;
    if (m.provider_id === "local-whisper") continue;
    if (m.provider_id === "local-mlx") continue;
    if (!VOICE_PROVIDERS.includes(m.provider_id)) continue;
    if (seen.has(m.model_id)) continue;
    seen.add(m.model_id);
    const meta = VOICE_META[m.model_id];
    cloud.push({
      key: m.model_id,
      kind: "cloud",
      name: m.model_name,
      provider: displayProviderName(m.provider_id, m.provider_name),
      modelId: m.model_id,
      speed: meta?.speed,
      quality: meta?.quality,
      cost: meta?.cost,
      streaming: meta?.streaming,
      note: meta?.note,
      hasKey: ctx.keyProviders.has(m.provider_id),
      available: m,
      selected:
        ctx.selectedProvider === m.provider_id &&
        ctx.selectedModelId === m.model_id,
    });
  }

  cloud.sort((a, b) => {
    const am = VOICE_META[a.modelId] ? 0 : 1;
    const bm = VOICE_META[b.modelId] ? 0 : 1;
    return am - bm;
  });

  return [...whisperLocal, ...mlxLocal, ...cloud];
}
