import { getDb } from "../db.js";
import { WHISPER_MODELS, WHISPER_PROVIDER_ID } from "../whisper/constants.js";
import { getModelStatus as getWhisperModelStatus } from "../whisper/models.js";
import { MLX_ASR_PROVIDER_ID } from "./constants.js";
import { canRunMlxAsr, stopMlxServer } from "./server.js";

const PREFERRED_WHISPER_FALLBACK_ID = "base-q5_1";

function pickWhisperFallbackId(): string {
  const preferred = getWhisperModelStatus(PREFERRED_WHISPER_FALLBACK_ID);
  if (preferred?.status === "ready") return PREFERRED_WHISPER_FALLBACK_ID;

  for (const model of WHISPER_MODELS) {
    if (getWhisperModelStatus(model.id)?.status === "ready") {
      return model.id;
    }
  }

  return PREFERRED_WHISPER_FALLBACK_ID;
}

/**
 * If the default voice model is MLX but this machine cannot run MLX (e.g. Intel Mac),
 * switch the default to local Whisper so transcription keeps working.
 */
export function reconcileUnsupportedMlxVoiceDefault(): boolean {
  if (canRunMlxAsr()) return false;

  const db = getDb();
  const voice = db
    .prepare(
      "SELECT provider FROM model_configs WHERE type = 'voice' AND is_default = 1 LIMIT 1",
    )
    .get() as { provider: string } | undefined;
  if (voice?.provider !== MLX_ASR_PROVIDER_ID) return false;

  const whisperId = pickWhisperFallbackId();
  const whisperDef =
    WHISPER_MODELS.find((m) => m.id === whisperId) ?? WHISPER_MODELS[0]!;

  db.exec("BEGIN");
  try {
    db.prepare(
      "UPDATE model_configs SET is_default = 0 WHERE type = 'voice'",
    ).run();
    db.prepare(
      `INSERT INTO model_configs (provider, model_id, model_name, type, is_default)
       VALUES (?, ?, ?, 'voice', 1)
       ON CONFLICT(provider, model_id, type) DO UPDATE SET
         is_default = 1,
         model_name = excluded.model_name`,
    ).run(
      WHISPER_PROVIDER_ID,
      `${WHISPER_PROVIDER_ID}/${whisperId}`,
      `Whisper ${whisperDef.displayName}`,
    );
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }

  stopMlxServer().catch(() => {});

  if (process.env.NODE_ENV !== "production") {
    console.log(
      `[mlx-asr] Default voice was MLX but this machine cannot run it; switched to Whisper ${whisperId}`,
    );
  }

  return true;
}
