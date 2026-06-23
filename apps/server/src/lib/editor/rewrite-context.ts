import type { DatabaseSync } from "node:sqlite";
import { parseAppContextPayload } from "./app-context.js";
import type { RewriteRegisterMode } from "./prompts.js";

interface FormatRuleRow {
  app_pattern: string;
  label?: string;
  instructions: string;
}

export interface RewritePromptContext {
  contextHint: string;
  registerMode: RewriteRegisterMode;
}

const FORMAL_RULE_LABELS = new Set([
  "Email",
  "Slack",
  "LinkedIn",
  "Document",
  "Code Platform",
  "Code Editor",
]);

const CASUAL_RULE_LABELS = new Set(["Discord", "Messaging", "X/Twitter"]);

const FORMAL_FALLBACK_PATTERNS = [
  "gmail",
  "mail",
  "outlook",
  "yahoo",
  "proton",
  "slack",
  "linkedin",
  "docs.google.com",
  "notion",
  "github",
  "gitlab",
  "cursor",
  "terminal",
  "iterm",
  "code",
];

const CASUAL_FALLBACK_PATTERNS = [
  "discord",
  "messages",
  "whatsapp",
  "telegram",
  "twitter",
  "x.com",
];

export function buildMatchContext(rawContext: string | null): string {
  if (!rawContext) return "";

  const ctx = parseAppContextPayload(rawContext);
  // Fall back to the raw string when the payload isn't valid JSON.
  if (!ctx) return rawContext;

  const parts: string[] = [];
  if (ctx.url) parts.push(ctx.url);
  if (ctx.title) parts.push(ctx.title);
  if (ctx.windowTitle) parts.push(ctx.windowTitle);
  if (ctx.app) parts.push(ctx.app);
  return parts.join(" ");
}

function inferRegisterModeFromLabel(
  label: string | undefined,
): RewriteRegisterMode {
  if (!label) return "neutral";
  if (FORMAL_RULE_LABELS.has(label)) return "formal";
  if (CASUAL_RULE_LABELS.has(label)) return "casual";
  return "neutral";
}

function inferRegisterModeFromMatchText(
  matchText: string,
): RewriteRegisterMode {
  const lower = matchText.toLowerCase();
  if (FORMAL_FALLBACK_PATTERNS.some((pattern) => lower.includes(pattern))) {
    return "formal";
  }
  if (CASUAL_FALLBACK_PATTERNS.some((pattern) => lower.includes(pattern))) {
    return "casual";
  }
  return "neutral";
}

export function getRewritePromptContext(
  rawContext: string | null,
  db: DatabaseSync,
): RewritePromptContext {
  if (!rawContext) {
    return { contextHint: "", registerMode: "neutral" };
  }

  const matchStr = buildMatchContext(rawContext);
  if (!matchStr) {
    return { contextHint: "", registerMode: "neutral" };
  }
  const matchStrLower = matchStr.toLowerCase();

  try {
    const rows = db
      .prepare(
        "SELECT app_pattern, label, instructions FROM format_rules ORDER BY is_default ASC, id DESC",
      )
      .all() as unknown as FormatRuleRow[];

    for (const row of rows) {
      const patterns = row.app_pattern.split("|").map((p) => p.trim());
      for (const pattern of patterns) {
        if (pattern && matchStrLower.includes(pattern.toLowerCase())) {
          const registerModeFromLabel = inferRegisterModeFromLabel(row.label);
          return {
            contextHint: row.instructions,
            registerMode:
              registerModeFromLabel === "neutral"
                ? inferRegisterModeFromMatchText(matchStr)
                : registerModeFromLabel,
          };
        }
      }
    }
  } catch {
    // format_rules table may not exist yet
  }

  try {
    const ctx = JSON.parse(rawContext) as { app?: string };
    if (ctx.app) {
      return {
        contextHint: `The user is dictating in ${ctx.app}.`,
        registerMode: inferRegisterModeFromMatchText(matchStr),
      };
    }
  } catch {
    // not JSON
  }

  return {
    contextHint: "",
    registerMode: inferRegisterModeFromMatchText(matchStr),
  };
}
