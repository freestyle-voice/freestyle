import { getDb } from "./db.js";
import { FREESTYLE_CLOUD_PROVIDER_ID } from "./freestyle-cloud.js";

const LOCAL_VOICE_PROVIDERS = ["local-mlx", "local-whisper"];

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

  const placeholders = LOCAL_VOICE_PROVIDERS.map(() => "?").join(", ");
  const local = db
    .prepare(
      `SELECT id FROM model_configs WHERE type = 'voice' AND provider IN (${placeholders}) ORDER BY created_at DESC LIMIT 1`,
    )
    .get(...LOCAL_VOICE_PROVIDERS) as { id: number } | undefined;
  if (!local) return;

  db.prepare(
    "UPDATE model_configs SET is_default = 0 WHERE type = 'voice'",
  ).run();
  db.prepare("UPDATE model_configs SET is_default = 1 WHERE id = ?").run(
    local.id,
  );
}
