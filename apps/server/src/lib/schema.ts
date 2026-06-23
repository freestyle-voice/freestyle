import type { DatabaseSync } from "node:sqlite";

const SCHEMA_VERSION = 9;

const DEFAULT_FORMAT_RULES = [
  {
    pattern: "mail.google.com|outlook|yahoo.com|proton",
    label: "Email",
    instructions:
      "If the transcript clearly dictates an email, preserve greeting/sign-off only if spoken, keep paragraph breaks clean, and do not invent a subject line.",
  },
  {
    pattern: "slack.com|Slack",
    label: "Slack",
    instructions:
      "Keep the wording intact. Add only light punctuation and paragraph breaks.",
  },
  {
    pattern: "discord.com|Discord",
    label: "Discord",
    instructions:
      "Keep the wording intact. Add only light punctuation and paragraph breaks.",
  },
  {
    pattern: "github.com|GitLab",
    label: "Code Platform",
    instructions:
      "Keep technical wording exact. Preserve explicit markdown, code blocks, or lists only if they were clearly dictated.",
  },
  {
    pattern: "docs.google.com|notion.so|Notion",
    label: "Document",
    instructions:
      "Preserve paragraph breaks and headings only when they are already clearly implied by the transcript.",
  },
  {
    pattern: "Code|Cursor|Terminal|iTerm",
    label: "Code Editor",
    instructions:
      "Keep technical terms exact. Do not rewrite for tone or style.",
  },
  {
    pattern: "Messages|WhatsApp|Telegram",
    label: "Messaging",
    instructions: "Keep the wording intact. Add only light punctuation.",
  },
  {
    pattern: "x.com|twitter.com",
    label: "X/Twitter",
    instructions:
      "Keep the wording intact. Do not shorten or rewrite for length.",
  },
  {
    pattern: "linkedin.com",
    label: "LinkedIn",
    instructions:
      "Keep the wording intact. Add only light punctuation and paragraph breaks.",
  },
  {
    pattern: "chatgpt.com|claude.ai|perplexity",
    label: "AI Chat",
    instructions:
      "Keep the wording intact. Preserve explicit prompt structure only if it was clearly dictated.",
  },
] as const;

const LEGACY_DEFAULT_FORMAT_RULES = [
  {
    pattern: "mail.google.com|outlook|yahoo.com|proton",
    label: "Email",
    instructions:
      "Format as a proper email body: use greeting if dictated, clear paragraphs separated by blank lines, professional tone, sign-off if dictated. No subject line.",
  },
  {
    pattern: "slack.com|Slack",
    label: "Slack",
    instructions: "Conversational, concise, professional. Casual punctuation.",
  },
  {
    pattern: "discord.com|Discord",
    label: "Discord",
    instructions: "Casual and conversational tone.",
  },
  {
    pattern: "github.com|GitLab",
    label: "Code Platform",
    instructions: "Clear, technical, well-structured with markdown.",
  },
  {
    pattern: "docs.google.com|notion.so|Notion",
    label: "Document",
    instructions:
      "Proper document formatting with clear paragraphs and structure.",
  },
  {
    pattern: "Code|Cursor|Terminal|iTerm",
    label: "Code Editor",
    instructions:
      "Clean prose for code comments, commits, or documentation. Preserve technical terms.",
  },
  {
    pattern: "Messages|WhatsApp|Telegram",
    label: "Messaging",
    instructions: "Casual and brief, like a text message.",
  },
  {
    pattern: "x.com|twitter.com",
    label: "X/Twitter",
    instructions: "Concise (280 chars ideal), punchy, and direct.",
  },
  {
    pattern: "linkedin.com",
    label: "LinkedIn",
    instructions: "Professional and well-structured.",
  },
  {
    pattern: "chatgpt.com|claude.ai|perplexity",
    label: "AI Chat",
    instructions: "Clear, well-structured prompt or message.",
  },
] as const;

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
      const stmt = db.prepare(
        "INSERT INTO format_rules (app_pattern, label, instructions, is_default) VALUES (?, ?, ?, ?)",
      );
      for (const rule of DEFAULT_FORMAT_RULES) {
        stmt.run(rule.pattern, rule.label, rule.instructions, 1);
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

  if (currentVersion < 7) {
    // Add validation status to api_keys
    try {
      db.exec(
        "ALTER TABLE api_keys ADD COLUMN status TEXT NOT NULL DEFAULT 'unknown'",
      );
    } catch {
      // Column may already exist
    }
  }

  if (currentVersion < 8) {
    const updateStmt = db.prepare(
      "UPDATE format_rules SET instructions = ?, updated_at = datetime('now') WHERE app_pattern = ? AND label = ? AND instructions = ? AND is_default = 1",
    );

    for (let i = 0; i < LEGACY_DEFAULT_FORMAT_RULES.length; i += 1) {
      const legacy = LEGACY_DEFAULT_FORMAT_RULES[i];
      const next = DEFAULT_FORMAT_RULES[i];
      updateStmt.run(
        next.instructions,
        legacy.pattern,
        legacy.label,
        legacy.instructions,
      );
    }
  }

  if (currentVersion < 9) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY CHECK(id = 1),
        token TEXT NOT NULL,
        refresh_token TEXT,
        expires_at INTEGER,
        issued_at INTEGER,
        user_id TEXT NOT NULL,
        email TEXT NOT NULL,
        name TEXT,
        image TEXT,
        host TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);
  }

  // Upsert schema version
  db.exec(`
    INSERT INTO schema_version (id, version) VALUES (1, ${SCHEMA_VERSION})
    ON CONFLICT(id) DO UPDATE SET version = ${SCHEMA_VERSION}
  `);
}
