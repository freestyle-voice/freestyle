import { getModelCost, isCleanupModelSupported } from "../routes/models.js";
import { getDb } from "./db.js";
import { createChatModel, getDefaultModels } from "./providers.js";
import { captureException, metrics } from "./sentry.js";
import { runShortcutsAgent } from "./shortcuts-agent.js";

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
  actionsExecuted: string[];
}

/**
 * Run the shortcuts agent (LLM cleanup + action dispatch) on transcribed text.
 * Falls back to regex-only shortcuts when no LLM is configured.
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
  let actionsExecuted: string[] = [];

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
      actionsExecuted: [],
    };
  }

  let cleanedText = rawText;

  // LLM-powered agent (handles cleanup + actions in one call)
  const llmSetting = db
    .prepare("SELECT value FROM settings WHERE key = 'llm_cleanup'")
    .get() as { value: string } | undefined;
  const llmEnabled = llmSetting?.value === "true";

  if (llmEnabled && defaults.llm) {
    if (
      !(await isCleanupModelSupported(
        defaults.llm.provider,
        defaults.llm.model_id,
      ))
    ) {
      console.warn(
        `Skipping LLM agent: unsupported model ${defaults.llm.provider}/${defaults.llm.model_id}`,
      );
    } else {
      const contextHint = getContextHint(appContext, db);

      try {
        const chatModel = createChatModel(
          defaults.llm.provider,
          defaults.llm.model_id,
        );

        const agentResult = await runShortcutsAgent(
          rawText,
          contextHint,
          chatModel,
          defaults.llm.model_id,
        );

        inputTokens = agentResult.inputTokens;
        outputTokens = agentResult.outputTokens;
        llmProvider = defaults.llm.provider;
        llmModel = defaults.llm.model_id;
        cleanedText = agentResult.text ?? "";
        actionsExecuted = agentResult.actionsExecuted;
      } catch (err) {
        captureException(err);
        metrics.count("post_process.llm_error", 1);
        console.error("Shortcuts agent failed:", err);
      }
    }
  }

  // Fallback: if LLM was not used, apply regex-based shortcuts
  if (!llmProvider) {
    try {
      const dictRows = db
        .prepare(
          "SELECT id, key, value, action FROM shortcuts WHERE action = 'replace' ORDER BY length(key) DESC",
        )
        .all() as { id: number; key: string; value: string; action: string }[];

      if (dictRows.length > 0) {
        const matchedIds: number[] = [];
        for (const { id, key, value } of dictRows) {
          const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const regex = new RegExp(`\\b${escaped}\\b`, "gi");
          if (regex.test(cleanedText)) {
            matchedIds.push(id);
            cleanedText = cleanedText.replace(
              new RegExp(`\\b${escaped}\\b`, "gi"),
              value,
            );
          }
        }
        if (matchedIds.length > 0) {
          const updateStmt = db.prepare(
            "UPDATE shortcuts SET usage_count = usage_count + 1 WHERE id = ?",
          );
          for (const id of matchedIds) {
            updateStmt.run(id);
          }
        }
      }
    } catch {
      // shortcuts table may not exist yet
    }
  }

  // Calculate cost
  if (inputTokens > 0 || outputTokens > 0) {
    try {
      if (llmProvider && llmModel) {
        const pricing = await getModelCost(llmProvider, llmModel);
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

  return {
    cleaned: cleanedText,
    llmProvider,
    llmModel,
    inputTokens,
    outputTokens,
    costUsd,
    actionsExecuted,
  };
}
