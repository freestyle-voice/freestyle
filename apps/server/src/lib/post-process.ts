import { generateText } from "ai";
import { getModelCost } from "../routes/models.js";
import { getDb } from "./db.js";
import { createChatModel, getDefaultModels } from "./providers.js";
import { captureException, metrics } from "./sentry.js";

/** Build a context string from the raw x-app-context header for matching */
function buildMatchContext(rawContext: string | null): string {
  if (!rawContext) return "";

  try {
    const ctx = JSON.parse(rawContext) as {
      app?: string;
      url?: string;
      title?: string;
      windowTitle?: string;
    };

    const parts: string[] = [];
    if (ctx.url) parts.push(ctx.url);
    if (ctx.title) parts.push(ctx.title);
    if (ctx.windowTitle) parts.push(ctx.windowTitle);
    if (ctx.app) parts.push(ctx.app);
    return parts.join(" ");
  } catch {
    return rawContext;
  }
}

/** Look up formatting instructions from the format_rules table */
function getContextHint(
  rawContext: string | null,
  db: ReturnType<typeof getDb>,
): string {
  if (!rawContext) return "";

  const matchStr = buildMatchContext(rawContext);
  if (!matchStr) return "";

  try {
    const rows = db
      .prepare(
        "SELECT app_pattern, instructions FROM format_rules ORDER BY is_default ASC, id DESC",
      )
      .all() as { app_pattern: string; instructions: string }[];

    for (const row of rows) {
      const patterns = row.app_pattern.split("|").map((p) => p.trim());
      for (const pattern of patterns) {
        if (pattern && matchStr.toLowerCase().includes(pattern.toLowerCase())) {
          return row.instructions;
        }
      }
    }
  } catch {
    // format_rules table may not exist yet
  }

  try {
    const ctx = JSON.parse(rawContext) as { app?: string };
    if (ctx.app) return `The user is dictating in ${ctx.app}.`;
  } catch {
    // not JSON
  }

  return "";
}

export interface PostProcessResult {
  cleaned: string;
  llmProvider: string | null;
  llmModel: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

/**
 * Run LLM cleanup and dictionary replacements on transcribed text.
 * Returns the cleaned text plus metadata for history tracking.
 */
export async function postProcess(
  rawText: string,
  appContext: string | null,
): Promise<PostProcessResult> {
  const ppStart = Date.now();
  const db = getDb();
  const defaults = getDefaultModels();
  let inputTokens = 0;
  let outputTokens = 0;
  let llmProvider: string | null = null;
  let llmModel: string | null = null;
  let costUsd = 0;

  const stripped = rawText
    .replace(/\b(um+|uh+|ah+|er+|hm+|hmm+|mm+|mhm+|you know|i mean)\b/gi, "")
    .replace(/[.…,!?\-–—\s]+/g, "");
  if (!stripped) {
    return {
      cleaned: "",
      llmProvider: null,
      llmModel: null,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    };
  }

  let cleaned = rawText;

  // LLM cleanup
  const llmSetting = db
    .prepare("SELECT value FROM settings WHERE key = 'llm_cleanup'")
    .get() as { value: string } | undefined;
  const llmEnabled = llmSetting?.value === "true";

  if (llmEnabled && defaults.llm) {
    const contextHint = getContextHint(appContext, db);
    const systemPrompt = `You clean up raw voice transcriptions into polished, ready-to-send text.
${contextHint ? `\nContext: ${contextHint}\n` : ""}
Edits you MUST apply:
1. Remove filler words (um, uh, like, you know, basically, so, I mean, right, actually, literally)
2. Remove false starts, repeated words, and self-corrections — keep only the final intended version
3. Fix punctuation, capitalization, and grammar
4. Convert spoken numbers, dates, and units to their written form (e.g. "three hundred dollars" → "$300")
5. Clean up spoken artifacts: "dot" → ".", "at sign" / "at" in emails → "@", "slash" → "/", "hashtag" → "#", "dash" → "-"
6. Smooth awkward phrasing caused by speech-to-text without changing the meaning
7. Break run-on sentences into proper sentences where the speaker clearly intended a pause
8. Ensure the text reads naturally as written communication

Rules:
- Preserve the speaker's meaning and tone faithfully
- Do NOT add information the speaker did not convey
- Do NOT summarize or omit content — keep everything the speaker said
- Do NOT add greetings, sign-offs, or filler the speaker didn't say
- Do NOT explain your edits or include any commentary
- If the input is only filler words or silence, return an empty string

IMPORTANT: Your entire response must be the cleaned text and nothing else. No quotes, no explanations, no reasoning, no prefixes.`;

    try {
      const chatModel = createChatModel(
        defaults.llm.provider,
        defaults.llm.model_id,
      );
      const result = await generateText({
        model: chatModel,
        system: systemPrompt,
        prompt: rawText,
      });
      let llmText = result.text.trim();
      inputTokens = result.usage?.inputTokens ?? 0;
      outputTokens = result.usage?.outputTokens ?? 0;
      llmProvider = defaults.llm.provider;
      llmModel = defaults.llm.model_id;

      // Guard: if the LLM leaked reasoning/commentary, extract the
      // actual cleaned text.
      if (llmText.includes("\n") && llmText.length > rawText.length * 2) {
        const quoted = llmText.match(/"([^"]+)"[^"]*$/);
        if (quoted) {
          llmText = quoted[1];
        } else {
          const lines = llmText.split("\n").filter((l) => l.trim());
          llmText = lines[lines.length - 1]?.trim() ?? rawText;
        }
      }

      // Strip surrounding quotes the LLM may have added
      if (
        llmText.startsWith('"') &&
        llmText.endsWith('"') &&
        !rawText.startsWith('"')
      ) {
        llmText = llmText.slice(1, -1);
      }

      cleaned = llmText;
    } catch (err) {
      captureException(err);
      metrics.count("post_process.llm_error", 1);
      console.error("LLM cleanup failed:", err);
    }
  }

  // Dictionary replacements
  try {
    const dictRows = db
      .prepare(
        "SELECT id, key, value FROM dictionary ORDER BY length(key) DESC",
      )
      .all() as { id: number; key: string; value: string }[];

    if (dictRows.length > 0) {
      const matchedIds: number[] = [];
      for (const { id, key, value } of dictRows) {
        const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(`\\b${escaped}\\b`, "gi");
        if (regex.test(cleaned)) {
          matchedIds.push(id);
          cleaned = cleaned.replace(
            new RegExp(`\\b${escaped}\\b`, "gi"),
            value,
          );
        }
      }
      if (matchedIds.length > 0) {
        const updateStmt = db.prepare(
          "UPDATE dictionary SET usage_count = usage_count + 1 WHERE id = ?",
        );
        for (const id of matchedIds) {
          updateStmt.run(id);
        }
      }
    }
  } catch {
    // Dictionary table may not exist yet
  }

  // Calculate cost
  if (inputTokens > 0 || outputTokens > 0) {
    try {
      if (llmModel) {
        const pricing = await getModelCost(llmModel);
        if (pricing) {
          costUsd = inputTokens * pricing.input + outputTokens * pricing.output;
        }
      }
    } catch {
      // ignore pricing errors
    }
  }

  metrics.distribution("post_process.latency", Date.now() - ppStart, {
    unit: "millisecond",
    attributes: llmModel ? { model: llmModel } : undefined,
  });

  return { cleaned, llmProvider, llmModel, inputTokens, outputTokens, costUsd };
}
