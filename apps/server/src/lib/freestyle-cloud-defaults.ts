import { getDb } from "./db.js";
import {
  FREESTYLE_CLOUD_CLEANUP_MODEL_ID,
  FREESTYLE_CLOUD_PROVIDER_ID,
  FREESTYLE_CLOUD_TRANSCRIBE_MODEL_ID,
} from "./freestyle-cloud.js";

export function applyFreestyleCloudDefaults(): void {
  const db = getDb();

  const setDefault = (
    modelId: string,
    modelName: string,
    type: "voice" | "llm",
  ): void => {
    db.prepare("UPDATE model_configs SET is_default = 0 WHERE type = ?").run(
      type,
    );
    db.prepare(
      `INSERT INTO model_configs (provider, model_id, model_name, type, is_default)
       VALUES (?, ?, ?, ?, 1)
       ON CONFLICT(provider, model_id, type) DO UPDATE SET is_default = 1`,
    ).run(FREESTYLE_CLOUD_PROVIDER_ID, modelId, modelName, type);
  };

  setDefault(
    FREESTYLE_CLOUD_TRANSCRIBE_MODEL_ID,
    "Freestyle Transcribe",
    "voice",
  );
  setDefault(
    FREESTYLE_CLOUD_CLEANUP_MODEL_ID,
    "Freestyle Transcribe Cleanup",
    "llm",
  );

  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES ('llm_cleanup', 'true', datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = 'true', updated_at = datetime('now')`,
  ).run();
}

export function revertFreestyleCloudDefaults(): void {
  const db = getDb();
  const llm = db
    .prepare(
      "SELECT provider FROM model_configs WHERE type = 'llm' AND is_default = 1 LIMIT 1",
    )
    .get() as { provider: string } | undefined;
  if (llm?.provider === FREESTYLE_CLOUD_PROVIDER_ID) {
    db.prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES ('llm_cleanup', 'false', datetime('now'))
       ON CONFLICT(key) DO UPDATE SET value = 'false', updated_at = datetime('now')`,
    ).run();
  }

  const current = db
    .prepare(
      "SELECT provider FROM model_configs WHERE type = 'voice' AND is_default = 1 LIMIT 1",
    )
    .get() as { provider: string } | undefined;
  if (!current || current.provider !== FREESTYLE_CLOUD_PROVIDER_ID) return;

  db.prepare(
    "UPDATE model_configs SET is_default = 0 WHERE type = 'voice'",
  ).run();

  const fallback = db
    .prepare(
      "SELECT id FROM model_configs WHERE type = 'voice' AND provider != ? ORDER BY created_at DESC LIMIT 1",
    )
    .get(FREESTYLE_CLOUD_PROVIDER_ID) as { id: number } | undefined;
  if (!fallback) return;

  db.prepare("UPDATE model_configs SET is_default = 1 WHERE id = ?").run(
    fallback.id,
  );
}
