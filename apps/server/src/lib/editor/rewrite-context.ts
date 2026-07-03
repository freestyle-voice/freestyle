import type { DatabaseSync } from "node:sqlite";
import { parseAppContextPayload } from "./app-context.js";
import {
  buildMatchableContext,
  type MatchableContext,
  patternMatchesContext,
} from "./context-match.js";
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

const FORMAL_FALLBACK_PATTERN =
  "gmail|mail|outlook|yahoo|proton mail|slack|linkedin|docs.google.com|notion|github|gitlab|cursor|terminal|iterm|code";

const CASUAL_FALLBACK_PATTERN =
  "discord|messages|whatsapp|telegram|twitter|x.com";

function inferRegisterModeFromLabel(
  label: string | undefined,
): RewriteRegisterMode {
  if (!label) return "neutral";
  if (FORMAL_RULE_LABELS.has(label)) return "formal";
  if (CASUAL_RULE_LABELS.has(label)) return "casual";
  return "neutral";
}

function inferRegisterModeFromContext(
  ctx: MatchableContext,
): RewriteRegisterMode {
  if (patternMatchesContext(ctx, FORMAL_FALLBACK_PATTERN)) return "formal";
  if (patternMatchesContext(ctx, CASUAL_FALLBACK_PATTERN)) return "casual";
  return "neutral";
}

export function getRewritePromptContext(
  rawContext: string | null,
  db: DatabaseSync,
): RewritePromptContext {
  const matchCtx = buildMatchableContext(rawContext);
  if (!matchCtx) {
    return { contextHint: "", registerMode: "neutral" };
  }

  try {
    const rows = db
      .prepare(
        "SELECT app_pattern, label, instructions FROM format_rules ORDER BY is_default ASC, id DESC",
      )
      .all() as unknown as FormatRuleRow[];

    for (const row of rows) {
      if (patternMatchesContext(matchCtx, row.app_pattern)) {
        const registerModeFromLabel = inferRegisterModeFromLabel(row.label);
        return {
          contextHint: row.instructions,
          registerMode:
            registerModeFromLabel === "neutral"
              ? inferRegisterModeFromContext(matchCtx)
              : registerModeFromLabel,
        };
      }
    }
  } catch {
    // format_rules table may not exist yet
  }

  const ctx = parseAppContextPayload(rawContext);
  if (ctx?.app) {
    return {
      contextHint: `The user is dictating in ${ctx.app}.`,
      registerMode: inferRegisterModeFromContext(matchCtx),
    };
  }

  return {
    contextHint: "",
    registerMode: inferRegisterModeFromContext(matchCtx),
  };
}
