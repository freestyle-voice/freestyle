import type { AsrVocabularyBias } from "../vocabulary-bias.js";

export interface TranscribeOptions {
  audio: Uint8Array;
  model: string;
  apiKey: string;
  /** ISO-639-1 language hint; omitted lets the model auto-detect. */
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

export interface TranscriptionProvider {
  readonly providerId: string;
  transcribe(opts: TranscribeOptions): Promise<TranscribeResult>;
}

/** Upper bound for one-shot cloud transcription requests. */
export const CLOUD_TRANSCRIBE_TIMEOUT_MS = 120_000;

export function stripProviderPrefix(modelId: string): string {
  const idx = modelId.indexOf("/");
  return idx >= 0 ? modelId.slice(idx + 1) : modelId;
}
