import type { AsrVocabularyBias } from "../vocabulary-bias.js";

export interface StreamCallbacks {
  onReady: (model: string) => void;
  onPartial: (text: string) => void;
  onFinal: (text: string) => void;
  onError: (message: string) => void;
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
  commit(): void;
  cancel(): void;
  close(): void;
}

export interface TranscribeOptions {
  audio: Uint8Array;
  model: string;
  apiKey: string;
  language?: string;
  /** ASR-only vocabulary bias for the first recognition pass. */
  bias?: AsrVocabularyBias | null;
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

export interface StreamingSessionOptions {
  apiKey: string;
  model: string;
  /** ISO-639-1 language hint; omitted or "auto" lets the model auto-detect. */
  language?: string;
  /** ASR-only vocabulary bias for the first recognition pass. */
  bias?: AsrVocabularyBias | null;
  callbacks: StreamCallbacks;
}

export interface TranscriptionProvider {
  readonly providerId: string;
  transcribe(opts: TranscribeOptions): Promise<TranscribeResult>;
  supportsStreaming(modelId: string): boolean;
  openStreamingSession?(opts: StreamingSessionOptions): StreamSession;
}

export function stripProviderPrefix(modelId: string): string {
  const idx = modelId.indexOf("/");
  return idx >= 0 ? modelId.slice(idx + 1) : modelId;
}
