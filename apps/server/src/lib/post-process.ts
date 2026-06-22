import type { GroqLanguageModelOptions } from "@ai-sdk/groq";
import { createAppLogger } from "@freestyle/utils";
import type { CleanupIntensity } from "@freestyle/validations";
import { parseCleanupIntensity } from "@freestyle/validations";
import { generateText } from "ai";
import { getModelCost, isCleanupModelSupported } from "../routes/models.js";
import { getDb } from "./db.js";
import { applyDictionaryReplacements } from "./dictionary-replacements.js";
import { maxOutputTokensForCleanup } from "./editor/max-output-tokens.js";
import { sanitizeTranscriptText } from "./editor/model-hints.js";
import { buildRewritePrompt } from "./editor/prompts.js";
import { getRewritePromptContext } from "./editor/rewrite-context.js";
import {
  getGroqChatModel,
  normalizeGroqModelId,
  prewarmGroqConnection,
} from "./groq-http.js";
import { parseAppContext, plugins } from "./plugins/index.js";
import { capture, captureException } from "./posthog.js";
import { createChatModel, getDefaultModels } from "./providers.js";

const log = createAppLogger("post-process");

export interface PostProcessTimings {
  handoffMs: number;
  llmMs: number;
}

export interface PostProcessResult {
  cleaned: string;
  llmProvider: string | null;
  llmModel: string | null;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  timings?: PostProcessTimings;
}

export type PostProcessSource =
  | "batch"
  | "multi_segment"
  | "streaming"
  | "streaming_handoff";

export interface PostProcessOptions {
  source?: PostProcessSource;
  language?: string;
  /** Return handoff/llm timing breakdown for pipeline logs. */
  includeTimings?: boolean;
}

function readSetting(
  db: ReturnType<typeof getDb>,
  key: string,
): string | undefined {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

function isLlmCleanupEnabled(db: ReturnType<typeof getDb>): boolean {
  return readSetting(db, "llm_cleanup") === "true";
}

function getCleanupIntensity(db: ReturnType<typeof getDb>): CleanupIntensity {
  return parseCleanupIntensity(readSetting(db, "cleanup_intensity"));
}

function getCleanupCustomPrompt(
  db: ReturnType<typeof getDb>,
): string | undefined {
  return readSetting(db, "cleanup_custom_prompt");
}

function resolveChatModel(provider: string, modelId: string) {
  if (provider === "groq") {
    return getGroqChatModel(modelId);
  }
  return createChatModel(provider, modelId);
}

export function groqCleanupProviderOptions(
  modelId: string,
): { groq: GroqLanguageModelOptions } | undefined {
  const shortId = normalizeGroqModelId(modelId);

  switch (shortId) {
    case "qwen/qwen3-32b":
      return {
        groq: {
          reasoningFormat: "hidden",
          reasoningEffort: "none",
        },
      };
    case "openai/gpt-oss-20b":
    case "openai/gpt-oss-120b":
      return {
        groq: {
          reasoningFormat: "hidden",
          reasoningEffort: "low",
        },
      };
    default:
      return undefined;
  }
}

/** Warm the default cleanup model while the user is still speaking. */
export function prewarmPostProcess(): void {
  const defaults = getDefaultModels();
  const llm = defaults.llm;
  if (!llm || !isLlmCleanupEnabled(getDb())) return;

  if (llm.provider === "groq") {
    void prewarmGroqConnection(normalizeGroqModelId(llm.model_id));
  }
}

/**
 * Run LLM cleanup and dictionary replacements on transcribed text.
 * Returns the cleaned text plus metadata for history tracking.
 */
export async function postProcess(
  rawText: string,
  appContext: string | null,
  options: PostProcessOptions = {},
): Promise<PostProcessResult> {
  const normalizedRawText = sanitizeTranscriptText(rawText);
  const source = options.source ?? "batch";
  const ppStart = Date.now();
  const db = getDb();
  const parsedContext = parseAppContext(appContext);
  const defaults = getDefaultModels();
  let inputTokens = 0;
  let outputTokens = 0;
  let llmProvider: string | null = null;
  let llmModel: string | null = null;
  let costUsd = 0;

  const stripped = normalizedRawText
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

  let cleanedText = normalizedRawText;
  const handoffStart = Date.now();
  const llm = defaults.llm;
  const llmStart = Date.now();
  let handoffMs = 0;

  if (llm && isLlmCleanupEnabled(db)) {
    if (!(await isCleanupModelSupported(llm.provider, llm.model_id))) {
      log.warn(
        `Skipping LLM cleanup: unsupported cleanup model ${llm.provider}/${llm.model_id}`,
      );
    } else {
      const rewriteContext = getRewritePromptContext(appContext, db);

      // Plugin hook: let plugins override the inferred writing register and
      // append extra system-prompt fragments. Runs before prompt assembly so a
      // register override actually feeds into buildRewritePrompt.
      const promptHook = await plugins().run(
        "cleanup.prompt",
        {
          text: normalizedRawText,
          appContext: parsedContext,
          inferredRegister: rewriteContext.registerMode,
        },
        { system: [] as string[], register: rewriteContext.registerMode },
      );

      const { system, prompt } = buildRewritePrompt(normalizedRawText, {
        contextHint: rewriteContext.contextHint || undefined,
        language: options.language,
        registerMode: promptHook.register ?? rewriteContext.registerMode,
        intensity: getCleanupIntensity(db),
        customPrompt: getCleanupCustomPrompt(db),
      });
      const pluginSystem =
        promptHook.system.length > 0
          ? system + promptHook.system.map((s) => `\n\n${s}`).join("")
          : system;

      handoffMs = Date.now() - handoffStart;

      try {
        const chatModel = resolveChatModel(llm.provider, llm.model_id);
        const result = await generateText({
          model: chatModel,
          system: pluginSystem,
          prompt,
          temperature: 0,
          maxOutputTokens: maxOutputTokensForCleanup(normalizedRawText),
          ...(llm.provider === "groq"
            ? {
                providerOptions: groqCleanupProviderOptions(llm.model_id),
              }
            : {}),
        });
        inputTokens = result.usage?.inputTokens ?? 0;
        outputTokens = result.usage?.outputTokens ?? 0;
        llmProvider = llm.provider;
        llmModel = llm.model_id;
        cleanedText = sanitizeTranscriptText(result.text);
      } catch (err) {
        captureException(err);
        capture("post process failed", {
          provider: llm.provider,
          model: llm.model_id,
          source,
        });
        log.error(`LLM cleanup failed: ${err}`);
        cleanedText = normalizedRawText;
      }
    }
  }

  const llmMs = Date.now() - llmStart;
  const beforeTransform = cleanedText;
  cleanedText = applyDictionaryReplacements(cleanedText, db);

  // Plugin hook: final text-rewrite chain, in the same stage as dictionary
  // replacement. Each plugin sees the previous plugin's output.
  cleanedText = (
    await plugins().run(
      "text.transform",
      { appContext: parsedContext },
      { text: cleanedText },
    )
  ).text;

  if (cleanedText !== beforeTransform) {
    void plugins().emit({
      type: "server.cleaned",
      before: beforeTransform,
      after: cleanedText,
    });
  }

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

  capture("post process completed", {
    source,
    duration_ms: Date.now() - ppStart,
    ...(llmModel ? { model: llmModel } : {}),
  });

  return {
    cleaned: cleanedText,
    llmProvider,
    llmModel,
    inputTokens,
    outputTokens,
    costUsd,
    ...(options.includeTimings ? { timings: { handoffMs, llmMs } } : {}),
  };
}
