import type { AsrVocabularyBias } from "../vocabulary-bias.js";

export interface StreamCallbacks {
  onReady: (model: string) => void;
  onPartial: (text: string) => void;
  onFinal: (text: string, raw?: string) => void;
  onError: (message: string, code?: string) => void;
  onClose: () => void;
}

export interface StreamSession {
  sendAudio(chunk: ArrayBuffer): void;
  /** Clear per-recording transcript state without tearing down the socket. */
  reset?(): void;
  /**
   * Resolves when the session can run inference (e.g. MLX worker loaded).
   * Audio may be sent before this completes; providers should buffer it.
   */
  waitUntilReady?(): Promise<void>;
  /** Update the app context forwarded to the upstream provider (if supported). */
  setContext?(context: string | null): void;
  /** Set the audio duration (ms) to include with the next commit (if supported). */
  setAudioDurationMs?(ms: number): void;
  commit(): void;
  cancel(): void;
  close(): void;
}

export interface TranscribeOptions {
  audio: Uint8Array;
  model: string;
  apiKey: string;
  /** ISO-639-1 language hint; omitted lets the model auto-detect. */
  language?: string;
  /** ASR-only vocabulary bias for the first recognition pass. */
  bias?: AsrVocabularyBias | null;
  appContext?: string | null;
}

export interface TranscribeResult {
  text: string;
  segments?: Array<{
    text: string;
    startSecond: number;
    endSecond: number;
  }>;
  durationInSeconds?: number;
}

/**
 * Cleanup preferences forwarded to providers that post-process server-side
 * (currently only freestyle-cloud). Local/BYOK providers ignore these — the
 * desktop runs its own `postProcess()` for those.
 *
 * The cloud reads the user's synced cleanup config (intensity, custom prompt,
 * tones, app assignments) from the member_preferences row, so only
 * request-scoped control values travel here.
 */
export interface StreamCleanupPreferences {
  /** When true, the provider should return the raw transcript with no LLM cleanup. */
  skipPostProcess: boolean;
  /**
   * Plugin-contributed system-prompt fragments (from `beforeCleanup` hook).
   * The cloud appends these to the assembled system prompt so plugin
   * instructions (e.g. emoji insertion) are honored in cloud-side cleanup.
   * Never synced, so they must travel inline.
   */
  systemFragments?: string[];
}

export interface StreamingSessionOptions {
  apiKey: string;
  model: string;
  /**
   * Normalized ISO-639-1 language hints (never "auto"); empty/undefined means
   * auto-detect, which each provider must translate to its own wire value.
   * Providers that accept multiple hints (e.g. Soniox `language_hints`) use the
   * whole list; single-language providers use the first (primary) code.
   */
  languages?: string[];
  translate?: boolean;
  /** ASR-only vocabulary bias for the first recognition pass. */
  bias?: AsrVocabularyBias | null;
  appContext?: string | null;
  /**
   * Cleanup preferences for server-side post-processing providers. Mirrors the
   * batch `/v2/transcribe` payload so streaming and batch behave identically.
   */
  cleanup?: StreamCleanupPreferences;
  callbacks: StreamCallbacks;
}

export interface TranscriptionProvider {
  readonly providerId: string;
  transcribe(opts: TranscribeOptions): Promise<TranscribeResult>;
  /** Live partials/finals over the websocket stream route. */
  supportsStreaming(modelId: string): boolean;
  /**
   * Session transport over the websocket stream route, even when the provider
   * only emits a single final transcript on commit.
   */
  supportsSessionTransport?(modelId: string): boolean;
  openStreamingSession?(opts: StreamingSessionOptions): StreamSession;
}

/** Upper bound for one-shot cloud transcription requests. */
export const CLOUD_TRANSCRIBE_TIMEOUT_MS = 120_000;

export function stripProviderPrefix(modelId: string): string {
  const idx = modelId.indexOf("/");
  return idx >= 0 ? modelId.slice(idx + 1) : modelId;
}
