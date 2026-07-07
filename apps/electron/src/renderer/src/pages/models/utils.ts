import {
  type AvailableModel,
  buildVoiceItems,
  displayProviderName,
  LLM_PROVIDERS,
  type MlxAsrStatus,
  VOICE_PROVIDERS,
  type VoiceItem,
  type WhisperStatus,
} from "@renderer/lib/models";

import {
  DEFAULT_MLX_KEEP_ALIVE_MINUTES,
  MAX_MLX_KEEP_ALIVE_MINUTES,
  MLX_KEEP_ALIVE_ALWAYS,
} from "./constants";
import type { ConfiguredModel } from "./types";

export function displayName(providerId: string, fallback?: string): string {
  return displayProviderName(providerId, fallback);
}

export function clampMlxKeepAliveMinutes(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_MLX_KEEP_ALIVE_MINUTES;
  // Any negative value is the "always on" sentinel (never unload).
  if (Math.round(value) < 0) return MLX_KEEP_ALIVE_ALWAYS;
  return Math.min(Math.max(Math.round(value), 0), MAX_MLX_KEEP_ALIVE_MINUTES);
}

export function groupByProvider(
  list: AvailableModel[],
  type: "voice" | "llm",
): Map<string, { providerName: string; models: AvailableModel[] }> {
  const map = new Map<
    string,
    { providerName: string; models: AvailableModel[] }
  >();
  const allowed = type === "voice" ? VOICE_PROVIDERS : LLM_PROVIDERS;
  for (const m of list) {
    if (m.type !== type) continue;
    if (!allowed.includes(m.provider_id)) continue;
    // Local LLM and local voice engines have their own dedicated sections.
    if (type === "llm" && m.provider_id === "local-llm") continue;
    if (type === "voice" && m.provider_id === "local-whisper") continue;
    if (type === "voice" && m.provider_id === "local-mlx") continue;
    let entry = map.get(m.provider_id);
    if (!entry) {
      entry = {
        providerName: displayName(m.provider_id, m.provider_name),
        models: [],
      };
      map.set(m.provider_id, entry);
    }
    entry.models.push(m);
  }
  return map;
}

// Thin wrapper around the shared helper, passing settings-page context.
/** Resolve speed/accuracy for the model currently shown in the pair card. */
export function voiceTraitsForConfigured(
  voice: ConfiguredModel | undefined,
  voiceItems: VoiceItem[],
): { speed?: number; quality?: number } {
  if (!voice) return {};

  const item = voiceItems.find((it) => {
    if (it.modelId === voice.model_id) return true;
    if (voice.provider === "local-whisper" && it.localEngine === "whisper") {
      return voice.model_id === `local-whisper/${it.defId}`;
    }
    if (voice.provider === "local-mlx" && it.localEngine === "mlx") {
      return voice.model_id === `local-mlx/${it.defId}`;
    }
    return false;
  });

  return { speed: item?.speed, quality: item?.quality };
}

export function buildSettingsVoiceItems(
  available: AvailableModel[],
  whisperStatus: WhisperStatus | null,
  mlxStatus: MlxAsrStatus | null,
  ctx: {
    defaultVoice: ConfiguredModel | undefined;
    keyProviders: Set<string>;
  },
): VoiceItem[] {
  return buildVoiceItems(available, whisperStatus, mlxStatus, {
    selectedModelId: ctx.defaultVoice?.model_id,
    selectedProvider: ctx.defaultVoice?.provider,
    keyProviders: ctx.keyProviders,
  });
}
