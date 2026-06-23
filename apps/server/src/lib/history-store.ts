import { getDb, readSetting } from "./db.js";

export const HISTORY_PAUSED_SETTING_KEY = "history_paused";

export interface RawHistoryEntry {
  rawText: string;
  voiceProvider: string;
  voiceModel: string;
  durationMs: number;
  audioDurationMs: number;
}

export interface ProcessedHistoryEntry extends RawHistoryEntry {
  cleanedText: string | null;
  llmProvider?: string | null;
  llmModel?: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export function isHistoryPaused(): boolean {
  return readSetting(HISTORY_PAUSED_SETTING_KEY) === "true";
}

export function saveRawHistory(entry: RawHistoryEntry): boolean {
  if (isHistoryPaused()) return false;

  getDb()
    .prepare(
      `INSERT INTO transcription_history
         (raw_text, voice_provider, voice_model, duration_ms, audio_duration_ms)
         VALUES (?, ?, ?, ?, ?)`,
    )
    .run(
      entry.rawText,
      entry.voiceProvider,
      entry.voiceModel,
      entry.durationMs,
      entry.audioDurationMs,
    );

  return true;
}

export function saveProcessedHistory(entry: ProcessedHistoryEntry): boolean {
  if (isHistoryPaused()) return false;

  getDb()
    .prepare(
      `INSERT INTO transcription_history
         (raw_text, cleaned_text, voice_provider, voice_model, llm_provider, llm_model, duration_ms, audio_duration_ms, input_tokens, output_tokens, cost_usd)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      entry.rawText,
      entry.cleanedText,
      entry.voiceProvider,
      entry.voiceModel,
      entry.llmProvider ?? null,
      entry.llmModel ?? null,
      entry.durationMs,
      entry.audioDurationMs,
      entry.inputTokens,
      entry.outputTokens,
      entry.costUsd,
    );

  return true;
}
