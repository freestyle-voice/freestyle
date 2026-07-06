import type { GroqLanguageModelOptions } from "@ai-sdk/groq";
import { createAppLogger } from "@freestyle-voice/utils";
import type {
  CleanupAppAssignment,
  CleanupEmailTone,
  CleanupIntensity,
  CleanupOverallTone,
  CleanupPersonalTone,
  CleanupWorkTone,
} from "@freestyle-voice/validations";
import {
  areAllCleanupTonesOff,
  parseCleanupAppAssignments,
  parseCleanupEmailTone,
  parseCleanupIntensity,
  parseCleanupOverallTone,
  parseCleanupPersonalTone,
  parseCleanupWorkTone,
} from "@freestyle-voice/validations";
import { generateText } from "ai";
import { getModelCost, isCleanupModelSupported } from "../routes/models.js";
import { getDb, readSetting } from "./db.js";
import { applyDictionaryReplacements } from "./dictionary-replacements.js";
import { maxOutputTokensForCleanup } from "./editor/max-output-tokens.js";
import { sanitizeTranscriptText } from "./editor/model-hints.js";
import { buildRewritePrompt } from "./editor/prompts.js";
import { getRewritePromptContext } from "./editor/rewrite-context.js";
import {
  FREESTYLE_CLOUD_PROVIDER_ID,
  FreestyleCloudAuthError,
  isTransientCloudError,
  postProcessWithFreestyleCloud,
} from "./freestyle-cloud.js";
import {
  getGroqChatModel,
  normalizeGroqModelId,
  prewarmGroqConnection,
} from "./groq-http.js";
import {
  FreestyleEventType,
  PipelineStage,
  parseAppContext,
  plugins,
} from "./plugins/index.js";
import { capture, captureException } from "./posthog.js";
import { createChatModel, getDefaultModels } from "./providers.js";
import { getSessionToken } from "./sessions.js";

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

export function isLlmCleanupEnabled(): boolean {
  return readSetting("llm_cleanup") === "true";
}

export function getCleanupIntensity(): CleanupIntensity {
  return parseCleanupIntensity(readSetting("cleanup_intensity"));
}

export function getCleanupCustomPrompt(): string | undefined {
  return readSetting("cleanup_custom_prompt");
}

export function getCleanupPersonalTone(): CleanupPersonalTone {
  return parseCleanupPersonalTone(readSetting("cleanup_personal_tone"));
}

export function getCleanupWorkTone(): CleanupWorkTone {
  return parseCleanupWorkTone(readSetting("cleanup_work_tone"));
}

export function getCleanupEmailTone(): CleanupEmailTone {
  return parseCleanupEmailTone(readSetting("cleanup_email_tone"));
}

export function getCleanupOverallTone(): CleanupOverallTone {
  return parseCleanupOverallTone(readSetting("cleanup_overall_tone"));
}

export function getCleanupAppAssignments(): CleanupAppAssignment[] {
  return parseCleanupAppAssignments(readSetting("cleanup_app_assignments"));
}

export interface EffectiveCleanupTones {
  intensity: CleanupIntensity;
  customPrompt: string | undefined;
  personalTone: CleanupPersonalTone;
  workTone: CleanupWorkTone;
  emailTone: CleanupEmailTone;
  overallTone: CleanupOverallTone;
}

/**
 * Resolve the cleanup strength + per-sector tones applied to a dictation.
 * Shared by every cleanup path (batch/local, Freestyle Cloud post-process,
 * and Freestyle Cloud streaming).
 */
export function getEffectiveCleanupTones(): EffectiveCleanupTones {
  return {
    intensity: getCleanupIntensity(),
    customPrompt: getCleanupCustomPrompt(),
    personalTone: getCleanupPersonalTone(),
    workTone: getCleanupWorkTone(),
    emailTone: getCleanupEmailTone(),
    overallTone: getCleanupOverallTone(),
  };
}

/** App context is only needed when cleanup is on and at least one sector tone is active. */
export function needsAppContextForCleanup(): boolean {
  if (!isLlmCleanupEnabled()) return false;
  return !areAllCleanupTonesOff(getEffectiveCleanupTones());
}

export function resolveAppContextForCleanup(
  appContext: string | null,
): string | null {
  return needsAppContextForCleanup() ? appContext : null;
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
  if (!llm || !isLlmCleanupEnabled()) return;

  if (llm.provider === "groq") {
    void prewarmGroqConnection(normalizeGroqModelId(llm.model_id));
  }
}

/**
 * Final text-rewrite stage that must run on every dictation regardless of
 * where cleanup happened — local LLM cleanup, Freestyle Cloud's combined
 * STT+cleanup, or no cleanup at all. Applies the user's dictionary
 * replacements, then runs the `afterCleanup` plugin hook (each plugin sees the
 * previous plugin's output).
 *
 * These steps used to live inside {@link postProcess}, so any path that
 * bypassed it (the Freestyle Cloud combined paths) silently dropped them. This
 * helper decouples them so callers can apply them to already-cleaned text.
 *
 * Dictionary replacement is skipped for empty text (nothing to replace), but
 * the `afterCleanup` hook always fires so plugins observe a consistent
 * lifecycle. When `rawForCleanedEvent` is provided, a single `Cleaned` event is
 * emitted whenever the final text differs from it.
 */
export async function applyFinalRewrites(
  text: string,
  appContext: string | null,
  rawForCleanedEvent?: string,
): Promise<string> {
  const effectiveAppContext = resolveAppContextForCleanup(appContext);
  let out = text;
  if (out.trim()) {
    out = applyDictionaryReplacements(out, getDb());
  }

  out = (
    await plugins().run(
      "afterCleanup",
      { appContext: parseAppContext(effectiveAppContext) },
      { text: out },
    )
  ).text;

  if (rawForCleanedEvent !== undefined && out !== rawForCleanedEvent) {
    void plugins().emit({
      type: FreestyleEventType.Cleaned,
      before: rawForCleanedEvent,
      after: out,
    });
  }

  return out;
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
  const effectiveAppContext = resolveAppContextForCleanup(appContext);
  const parsedContext = parseAppContext(effectiveAppContext);
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

  if (llm && isLlmCleanupEnabled()) {
    // Resolved cleanup config for both Freestyle Cloud and local-model paths.
    const {
      intensity,
      customPrompt,
      personalTone,
      workTone,
      emailTone,
      overallTone,
    } = getEffectiveCleanupTones();

    if (llm.provider === FREESTYLE_CLOUD_PROVIDER_ID) {
      // Freestyle Cloud assembles its cleanup prompts server-side: it resolves
      // the destination from appContext + appAssignments and applies the tone
      // preferences we forward here, mirroring the local/direct-model path.
      const token = getSessionToken();
      if (!token) throw new FreestyleCloudAuthError();
      try {
        const result = await postProcessWithFreestyleCloud({
          token,
          text: normalizedRawText,
          appContext: effectiveAppContext,
          language: options.language,
          intensity,
          customPrompt,
          personalTone,
          workTone,
          emailTone,
          overallTone,
          appAssignments: getCleanupAppAssignments(),
        });
        inputTokens = result.usage?.inputTokens ?? 0;
        outputTokens = result.usage?.outputTokens ?? 0;
        llmProvider = llm.provider;
        llmModel = llm.model_id;
        cleanedText = sanitizeTranscriptText(result.cleaned);
      } catch (err) {
        if (err instanceof FreestyleCloudAuthError) throw err;
        // Transient network faults / upstream 5xx aren't app defects.
        if (!isTransientCloudError(err)) captureException(err);
        capture("post process failed", {
          provider: llm.provider,
          model: llm.model_id,
          source,
        });
        log.error(`Freestyle Cloud cleanup failed: ${err}`);
        cleanedText = normalizedRawText;
      }
    } else if (!(await isCleanupModelSupported(llm.provider, llm.model_id))) {
      log.warn(
        `Skipping LLM cleanup: unsupported cleanup model ${llm.provider}/${llm.model_id}`,
      );
    } else {
      const { destination, personalSurface } = getRewritePromptContext(
        effectiveAppContext,
        getCleanupAppAssignments(),
      );

      // Plugin hook: let plugins override the inferred destination and
      // append extra system-prompt fragments. Runs before prompt assembly so a
      // destination override actually feeds into buildRewritePrompt.
      const promptHook = await plugins().run(
        "beforeCleanup",
        {
          text: normalizedRawText,
          appContext: parsedContext,
          destination,
        },
        { system: [] as string[], destination },
      );

      const { system, prompt } = buildRewritePrompt(normalizedRawText, {
        language: options.language,
        intensity,
        customPrompt,
        destination: promptHook.destination ?? destination,
        personalTone,
        personalSurface:
          (promptHook.destination ?? destination) === "personal"
            ? personalSurface
            : null,
        workTone,
        emailTone,
        overallTone,
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
        if (!isTransientCloudError(err)) captureException(err);
        void plugins().emit({
          type: FreestyleEventType.PipelineError,
          stage: PipelineStage.Cleanup,
          message: err instanceof Error ? err.message : String(err),
        });
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
  // Dictionary replacement + `afterCleanup` plugin hook + `Cleaned` event. Runs
  // on the full raw -> final transformation for this dictation.
  cleanedText = await applyFinalRewrites(
    cleanedText,
    appContext,
    normalizedRawText,
  );

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
