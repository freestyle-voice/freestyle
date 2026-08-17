import { sanitizeTranscriptText } from "@freestyle-voice/stt";
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
import { getModelCostCached } from "../routes/models.js";
import { getDb, readSetting, readSettings } from "./db.js";
import { applyDictionaryReplacements } from "./dictionary-replacements.js";
import { ensureCleanupPromptConfigFresh } from "./editor/prompt-config.js";
import { getRewritePromptContext } from "./editor/rewrite-context.js";
import {
  FREESTYLE_CLOUD_PROVIDER_ID,
  FreestyleCloudAuthError,
  isTransientCloudError,
  postProcessWithFreestyleCloud,
} from "./freestyle-cloud.js";
import {
  FreestyleEventType,
  parseAppContext,
  plugins,
} from "./plugins/index.js";
import { createHookApi } from "./plugins/pipeline.js";
import { capture, captureException } from "./posthog.js";
import { getDefaultModels } from "./providers.js";
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
  /** The resolved tone routing destination for analytics. */
  destination?: string;
}

export type PostProcessSource =
  | "batch"
  | "multi_segment"
  | "streaming"
  | "streaming_handoff";

export interface PostProcessOptions {
  source?: PostProcessSource;
  languages?: string[];
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
  // Single batched read instead of six separate point-queries — this runs on
  // the transcription/streaming hot path (both `/api/transcribe` and the
  // streaming config-key build call it per dictation).
  const s = readSettings([
    "cleanup_intensity",
    "cleanup_custom_prompt",
    "cleanup_personal_tone",
    "cleanup_work_tone",
    "cleanup_email_tone",
    "cleanup_overall_tone",
  ]);
  return {
    intensity: parseCleanupIntensity(s.get("cleanup_intensity")),
    customPrompt: s.get("cleanup_custom_prompt"),
    personalTone: parseCleanupPersonalTone(s.get("cleanup_personal_tone")),
    workTone: parseCleanupWorkTone(s.get("cleanup_work_tone")),
    emailTone: parseCleanupEmailTone(s.get("cleanup_email_tone")),
    overallTone: parseCleanupOverallTone(s.get("cleanup_overall_tone")),
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
  // Opportunistically refresh the cleanup-prompt config if the cached copy has
  // aged past its TTL. Fire-and-forget: the current dictation uses whatever is
  // already in memory (fresh, stale, or bundled); this only warms the next one.
  void ensureCleanupPromptConfigFresh();

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
  // Resolve tone-routing destination for analytics — computed once here so all
  // branches (cloud, local-LLM, no-cleanup) can include it in capture calls.
  const { destination: resolvedDestination } = getRewritePromptContext(
    effectiveAppContext,
    getCleanupAppAssignments(),
  );

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
  const llm = defaults.llm;
  const llmStart = Date.now();
  const handoffMs = 0;

  // A plugin already consumed/aborted the pipeline in an earlier stage (e.g.
  // `afterTranscribe`) — skip cleanup entirely rather than spending an LLM
  // call on text the pipeline has already decided not to deliver.
  if (api.control.state !== "running") {
    cleanedText = normalizedRawText;
  } else if (llm && isLlmCleanupEnabled()) {
    if (llm.provider === FREESTYLE_CLOUD_PROVIDER_ID) {
      // Freestyle Cloud assembles its cleanup prompts server-side: it resolves
      // the destination from appContext + appAssignments and applies the tone
      // preferences we forward here, mirroring the local/direct-model path.
      //
      // The `beforeCleanup` hook still runs so its locally-decidable outputs
      // are honored on the cloud path too: `skip` and `consume()`/`abort()`
      // short-circuit the cloud call. `system` fragments are forwarded to the
      // cloud so plugin-contributed prompt instructions (e.g. emoji insertion)
      // are applied during cloud-side prompt assembly.
      const promptHook = await plugins().run(
        "beforeCleanup",
        {
          text: normalizedRawText,
          appContext: parsedContext,
          destination: resolvedDestination,
        },
        { system: [] as string[] },
        api,
      );

      if (promptHook.skip || api.control.state !== "running") {
        // `skip`/`consume()`/`abort()` short-circuit the cloud call, just like
        // the local-model branch. Fall through to the shared tail (dictionary +
        // `afterCleanup` + `Cleaned` event) with the raw text.
        cleanedText = normalizedRawText;
      } else {
        const token = getSessionToken();
        if (!token) throw new FreestyleCloudAuthError();
        try {
          const result = await postProcessWithFreestyleCloud({
            token,
            text: normalizedRawText,
            appContext: effectiveAppContext,
            ...(promptHook.system.length > 0
              ? { systemFragments: promptHook.system }
              : {}),
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
            app_name: parsedContext?.appName,
            destination: resolvedDestination,
            has_app_context: !!effectiveAppContext,
          });
          log.error(`Freestyle Cloud cleanup failed: ${err}`);
          cleanedText = normalizedRawText;
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
    if (llmProvider && llmModel) {
      // Cache-only lookup — never blocks the response on a models.dev fetch.
      // The registry is warmed off the hot path by the transcribe pre-warm
      // route; a cold-cache miss simply records cost 0.
      const pricing = getModelCostCached(llmProvider, llmModel);
      if (pricing) {
        costUsd = inputTokens * pricing.input + outputTokens * pricing.output;
      }
    }
  }

  capture("post process completed", {
    source,
    duration_ms: Date.now() - ppStart,
    ...(llmModel ? { model: llmModel } : {}),
    app_name: parsedContext?.appName,
    destination: resolvedDestination,
    has_app_context: !!effectiveAppContext,
  });

  return {
    cleaned: cleanedText,
    llmProvider,
    llmModel,
    inputTokens,
    outputTokens,
    costUsd,
    ...(options.includeTimings ? { timings: { handoffMs, llmMs } } : {}),
    destination: resolvedDestination,
  };
}
