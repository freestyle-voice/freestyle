import { parseRetentionDays } from "@freestyle-voice/validations";
import { getDb, readSetting } from "./db.js";
import { capture, captureException } from "./posthog.js";

export const HISTORY_PAUSED_SETTING_KEY = "history_paused";
export const HISTORY_RETENTION_SETTING_KEY = "history_retention_days";

const RETENTION_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;

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

export function getHistoryRetentionDays(): number | null {
  return parseRetentionDays(readSetting(HISTORY_RETENTION_SETTING_KEY));
}

export function purgeExpiredHistory(): number {
  const days = getHistoryRetentionDays();
  if (days === null) return 0;

  const result = getDb()
    .prepare(
      "DELETE FROM transcription_history WHERE created_at < datetime('now', ?)",
    )
    .run(`-${days} days`);

  const deleted = Number(result.changes);
  if (deleted > 0) {
    capture("history expired entries purged", {
      deleted_count: deleted,
      retention_days: days,
    });
  }
  return deleted;
}

let retentionSweepTimer: NodeJS.Timeout | null = null;

export function startHistoryRetentionSweep(): void {
  if (retentionSweepTimer) return;

  const sweep = (): void => {
    try {
      purgeExpiredHistory();
    } catch (err) {
      captureException(err);
    }
  };

  sweep();
  retentionSweepTimer = setInterval(sweep, RETENTION_SWEEP_INTERVAL_MS);
  retentionSweepTimer.unref();
}

export function stopHistoryRetentionSweep(): void {
  if (retentionSweepTimer) {
    clearInterval(retentionSweepTimer);
    retentionSweepTimer = null;
  }
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
