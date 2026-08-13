import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { initSchema } from "../src/lib/schema.js";

let db: DatabaseSync | null = null;

afterEach(() => {
  db?.close();
  db = null;
});

function createV13Db(): DatabaseSync {
  const instance = new DatabaseSync(":memory:");
  instance.exec(`
    CREATE TABLE schema_version (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      version INTEGER NOT NULL
    );
    INSERT INTO schema_version (id, version) VALUES (1, 13);

    CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE model_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      provider TEXT NOT NULL,
      model_id TEXT NOT NULL,
      model_name TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('voice', 'llm')),
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(provider, model_id, type)
    );

    CREATE TABLE transcription_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      raw_text TEXT NOT NULL,
      cleaned_text TEXT,
      voice_provider TEXT NOT NULL,
      voice_model TEXT NOT NULL,
      llm_provider TEXT,
      llm_model TEXT,
      duration_ms INTEGER NOT NULL DEFAULT 0,
      audio_duration_ms INTEGER NOT NULL DEFAULT 0,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return instance;
}

function insertModel(
  instance: DatabaseSync,
  provider: string,
  modelId: string,
  type: "voice" | "llm",
  isDefault: number,
): void {
  instance
    .prepare(
      `INSERT INTO model_configs (provider, model_id, model_name, type, is_default)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(provider, modelId, modelId, type, isDefault);
}

describe("freestyle cloud cleanup migration (v14)", () => {
  it("drops the legacy default cleanup config and turns off llm_cleanup", () => {
    db = createV13Db();
    insertModel(db, "freestyle-cloud", "freestyle-cloud/stt", "voice", 1);
    insertModel(
      db,
      "freestyle-cloud",
      "freestyle-cloud/post-process",
      "llm",
      1,
    );
    db.prepare(
      "INSERT INTO settings (key, value) VALUES ('llm_cleanup', 'true')",
    ).run();

    initSchema(db);

    const llmRows = db
      .prepare(
        "SELECT * FROM model_configs WHERE provider = 'freestyle-cloud' AND type = 'llm'",
      )
      .all();
    expect(llmRows).toHaveLength(0);

    const voiceRow = db
      .prepare(
        "SELECT is_default FROM model_configs WHERE provider = 'freestyle-cloud' AND type = 'voice'",
      )
      .get() as { is_default: number };
    expect(voiceRow.is_default).toBe(1);

    const cleanup = db
      .prepare("SELECT value FROM settings WHERE key = 'llm_cleanup'")
      .get() as { value: string };
    expect(cleanup.value).toBe("false");
  });

  it("drops legacy configs without touching llm_cleanup", () => {
    db = createV13Db();
    insertModel(
      db,
      "freestyle-cloud",
      "freestyle-cloud/post-process",
      "llm",
      0,
    );
    insertModel(db, "groq", "groq/llama-3.1-8b-instant", "llm", 1);
    db.prepare(
      "INSERT INTO settings (key, value) VALUES ('llm_cleanup', 'true')",
    ).run();

    initSchema(db);

    const llmRows = db
      .prepare("SELECT provider FROM model_configs WHERE type = 'llm'")
      .all() as { provider: string }[];
    expect(llmRows).toHaveLength(0);

    const cleanup = db
      .prepare("SELECT value FROM settings WHERE key = 'llm_cleanup'")
      .get() as { value: string };
    expect(cleanup.value).toBe("true");
  });
});
