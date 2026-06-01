import type { DatabaseSync } from "node:sqlite";

const SCHEMA_VERSION = 6;

export function initSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      id INTEGER PRIMARY KEY CHECK(id = 1),
      version INTEGER NOT NULL
    )
  `);

  const row = db
    .prepare("SELECT version FROM schema_version WHERE id = 1")
    .get() as { version: number } | undefined;
  const currentVersion = row?.version ?? 0;

  if (currentVersion < 1) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS api_keys (
        provider TEXT PRIMARY KEY,
        key TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS model_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL,
        model_id TEXT NOT NULL,
        model_name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('voice', 'llm')),
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE(provider, model_id, type)
      )
    `);
  }

  if (currentVersion < 2) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS transcription_history (
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
      )
    `);
  }

  if (currentVersion < 3) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS dictionary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL UNIQUE,
        value TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  if (currentVersion < 4) {
    // Add usage_count to dictionary
    try {
      db.exec(
        "ALTER TABLE dictionary ADD COLUMN usage_count INTEGER NOT NULL DEFAULT 0",
      );
    } catch {
      // Column may already exist
    }
  }

  if (currentVersion < 5) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS format_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        app_pattern TEXT NOT NULL,
        label TEXT NOT NULL,
        instructions TEXT NOT NULL,
        is_default INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Seed default format rules
    const count = db
      .prepare("SELECT COUNT(*) as c FROM format_rules")
      .get() as { c: number };
    if (count.c === 0) {
      const defaults = [
        [
          "mail.google.com|outlook|yahoo.com|proton",
          "Email",
          "Format as a proper email body: use greeting if dictated, clear paragraphs separated by blank lines, professional tone, sign-off if dictated. No subject line.",
          1,
        ],
        [
          "slack.com|Slack",
          "Slack",
          "Conversational, concise, professional. Casual punctuation.",
          1,
        ],
        [
          "discord.com|Discord",
          "Discord",
          "Casual and conversational tone.",
          1,
        ],
        [
          "github.com|GitLab",
          "Code Platform",
          "Clear, technical, well-structured with markdown.",
          1,
        ],
        [
          "docs.google.com|notion.so|Notion",
          "Document",
          "Proper document formatting with clear paragraphs and structure.",
          1,
        ],
        [
          "Code|Cursor|Terminal|iTerm",
          "Code Editor",
          "Clean prose for code comments, commits, or documentation. Preserve technical terms.",
          1,
        ],
        [
          "Messages|WhatsApp|Telegram",
          "Messaging",
          "Casual and brief, like a text message.",
          1,
        ],
        [
          "x.com|twitter.com",
          "X/Twitter",
          "Concise (280 chars ideal), punchy, and direct.",
          1,
        ],
        ["linkedin.com", "LinkedIn", "Professional and well-structured.", 1],
        [
          "chatgpt.com|claude.ai|perplexity",
          "AI Chat",
          "Clear, well-structured prompt or message.",
          1,
        ],
      ];
      const stmt = db.prepare(
        "INSERT INTO format_rules (app_pattern, label, instructions, is_default) VALUES (?, ?, ?, ?)",
      );
      for (const [pattern, label, instructions, isDefault] of defaults) {
        stmt.run(pattern, label, instructions, isDefault);
      }
    }
  }

  if (currentVersion < 6) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS vocabulary (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        term TEXT NOT NULL UNIQUE,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
  }

  // Upsert schema version
  db.exec(`
    INSERT INTO schema_version (id, version) VALUES (1, ${SCHEMA_VERSION})
    ON CONFLICT(id) DO UPDATE SET version = ${SCHEMA_VERSION}
  `);
}
