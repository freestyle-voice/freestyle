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

export const CLOUD_VOICE_PROVIDERS = [
  "openai",
  "groq",
  "deepgram",
  "elevenlabs",
];

export const VOICE_PROVIDERS = [...CLOUD_VOICE_PROVIDERS, "local-whisper"];

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
