import {
  postProcess as cleanupWithModel,
  sanitizeTranscriptText,
} from "@freestyle-voice/stt";
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
import type { HookApi } from "freestyle-voice";
import { getModelCost, isCleanupModelSupported } from "../routes/models.js";
import { getDb, readSetting } from "./db.js";
import { applyDictionaryReplacements } from "./dictionary-replacements.js";
import { buildRewritePrompt } from "./editor/prompts.js";
import { getRewritePromptContext } from "./editor/rewrite-context.js";
import {
  FREESTYLE_CLOUD_PROVIDER_ID,
  FreestyleCloudAuthError,
  isTransientCloudError,
  postProcessWithFreestyleCloud,
} from "./freestyle-cloud.js";
import { getLlmProvider } from "./llm/registry.js";
import {
  FreestyleEventType,
  PipelineStage,
  parseAppContext,
  plugins,
} from "./plugins/index.js";
import { createHookApi } from "./plugins/pipeline.js";
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

export type PostProcessSource = "batch" | "multi_segment";

export interface PostProcessOptions {
  source?: PostProcessSource;
  language?: string;
  /** Return handoff/llm timing breakdown for pipeline logs. */
  includeTimings?: boolean;
  /**
   * Reuse a {@link HookApi} built earlier in this dictation's pipeline (e.g. by
   * `/api/transcribe`, so `api.control` carries state from `afterTranscribe`
   * into `beforeCleanup`/`afterCleanup`). A fresh one is built when omitted.
   */
  api?: HookApi;
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

/** Warm the default cleanup model while the user is still speaking. */
export function prewarmPostProcess(): void {
  const defaults = getDefaultModels();
  const llm = defaults.llm;
  if (!llm || !isLlmCleanupEnabled()) return;

  getLlmProvider(llm.provider)?.prewarm?.(llm.model_id);
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
  api?: HookApi,
): Promise<string> {
  const effectiveAppContext = resolveAppContextForCleanup(appContext);
  const hookApi = api ?? (await createHookApi());
  let out = text;
  if (out.trim()) {
    out = applyDictionaryReplacements(out, getDb());
  }

  out = (
    await plugins().run(
      "afterCleanup",
      { appContext: parseAppContext(effectiveAppContext) },
      { text: out },
      hookApi,
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
  const api = options.api ?? (await createHookApi());
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

  // A plugin already consumed/aborted the pipeline in an earlier stage (e.g.
  // `afterTranscribe`) — skip cleanup entirely rather than spending an LLM
  // call on text the pipeline has already decided not to deliver.
  if (api.control.state !== "running") {
    cleanedText = normalizedRawText;
  } else if (llm && isLlmCleanupEnabled()) {
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

      // Plugin hook: let plugins override the inferred destination, append
      // extra system-prompt fragments, replace the prompt outright, or skip
      // cleanup entirely. Runs before prompt assembly so overrides actually
      // feed into buildRewritePrompt.
      const promptHook = await plugins().run(
        "beforeCleanup",
        {
          text: normalizedRawText,
          appContext: parsedContext,
          destination,
        },
        { system: [] as string[], destination },
        api,
      );

      if (promptHook.skip) {
        cleanedText = normalizedRawText;
      } else {
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
        // A plugin can replace the assembled prompt outright while still
        // contributing `system` fragments.
        const finalPrompt = promptHook.prompt ?? prompt;

        handoffMs = Date.now() - handoffStart;

        const chatModel = await createChatModel(llm.provider, llm.model_id);
        let cleanupError: unknown;
        const result = await cleanupWithModel({
          model: chatModel,
          text: normalizedRawText,
          system: pluginSystem,
          prompt: finalPrompt,
          // The empty/filler-only case is already handled above for the whole
          // function (both the cloud and local-model branches), so this call
          // is guaranteed non-empty text — disable the package's own internal
          // check rather than relying on two independently-maintained filler
          // regexes staying in sync.
          skipEmptyText: false,
          providerOptions: getLlmProvider(llm.provider)?.providerOptions?.(
            llm.model_id,
          ),
          onError: (err) => {
            cleanupError = err;
          },
        });

        if (result.model) {
          inputTokens = result.inputTokens;
          outputTokens = result.outputTokens;
          llmProvider = llm.provider;
          // Record the configured model id (e.g. `groq/qwen/qwen3-32b`), not
          // the AI SDK's prefix-stripped `result.model` (`qwen/qwen3-32b`), so
          // the persisted history label stays consistent with pre-migration
          // rows and the Freestyle Cloud branch above.
          llmModel = llm.model_id;
          cleanedText = result.cleaned;
        } else {
          const err = cleanupError;
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
          cleanedText = result.cleaned;
        }
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
    api,
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
