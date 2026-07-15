import { sanitizeTranscriptText } from "@freestyle-voice/stt";
import { createAppLogger } from "@freestyle-voice/utils";
import { Hono } from "hono";
import { readSetting } from "../lib/db.js";
import { formatError } from "../lib/format-error.js";
import {
  FREESTYLE_CLOUD_PROVIDER_ID,
  FreestyleCloudAuthError,
  FreestyleCloudUsageError,
  isTransientCloudError,
  prewarmFreestyleCloudConnection,
  transcribeWithFreestyleCloud,
} from "../lib/freestyle-cloud.js";
import { saveProcessedHistory, saveRawHistory } from "../lib/history-store.js";
import { getLanguageSetting } from "../lib/language.js";
import { MLX_ASR_PROVIDER_ID } from "../lib/mlx-asr/constants.js";
import { getMlxModelStatus } from "../lib/mlx-asr/models.js";
import { canRunMlxAsr, startMlxInBackground } from "../lib/mlx-asr/server.js";
import {
  FreestyleEventType,
  PipelineStage,
  parseAppContext,
  plugins,
} from "../lib/plugins/index.js";
import {
  createHookApi,
  dispositionFromControl,
  emitAbortEvent,
} from "../lib/plugins/pipeline.js";
import {
  applyFinalRewrites,
  getCleanupAppAssignments,
  getEffectiveCleanupTones,
  postProcess,
  prewarmPostProcess,
  resolveAppContextForCleanup,
} from "../lib/post-process.js";
import { capture, captureException } from "../lib/posthog.js";
import { getDefaultModels } from "../lib/providers.js";
import { invalidateSession } from "../lib/sessions.js";
import { CloudAuthError } from "../lib/streaming/providers/freestyle-cloud.js";
import { getProvider } from "../lib/streaming/registry.js";
import { stripProviderPrefix } from "../lib/streaming/types.js";
import { getApiKeyForProvider } from "../lib/streaming-stt.js";
import { getCloudVocabularyBias } from "../lib/vocabulary.js";
import {
  buildAsrVocabularyBias,
  resolveAsrVocabularyBias,
} from "../lib/vocabulary-bias.js";
import { isServerBinaryAvailable } from "../lib/whisper/binary.js";
import { WHISPER_PROVIDER_ID } from "../lib/whisper/constants.js";
import { startInBackground } from "../lib/whisper/server.js";

const log = createAppLogger("transcribe");

function routeVoiceProviderCategory(
  providerId: string,
): "local" | "byok" | "freestyle_cloud" {
  if (providerId === "local-whisper" || providerId === "local-mlx")
    return "local";
  if (providerId === FREESTYLE_CLOUD_PROVIDER_ID) return "freestyle_cloud";
  return "byok";
}

/**
 * The client percent-encodes the x-app-context header so non-Latin1
 * characters (e.g. a Cyrillic window title) survive transport. Decode it
 * back here, tolerating values that were sent unencoded by older clients.
 */
function decodeAppContext(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

const transcribeRoute = new Hono().post("/", async (c) => {
  const start = Date.now();

  const contentType = c.req.header("content-type") ?? "";
  let audioData: Uint8Array;

  if (contentType.includes("multipart/form-data")) {
    const form = await c.req.formData();
    const audioFile = form.get("audio");
    if (!(audioFile instanceof File)) {
      return c.json({ error: "audio field missing or not a file" }, 400);
    }
    audioData = new Uint8Array(await audioFile.arrayBuffer());
  } else {
    audioData = new Uint8Array(await c.req.arrayBuffer());
  }

  if (audioData.length === 0) {
    return c.json({ error: "Empty audio data" }, 400);
  }

  log.debug(
    `received audio: ${audioData.length} bytes, header=${String.fromCharCode(
      ...audioData.slice(0, 4),
    )} contentType=${contentType.slice(0, 40)}`,
  );

  const appContext = resolveAppContextForCleanup(
    decodeAppContext(c.req.header("x-app-context")),
  );

  let audioDurationMs = 0;
  if (audioData.length > 44) {
    audioDurationMs = Math.round((audioData.length - 44) / 32);
  }
  if (!audioDurationMs) {
    const h = c.req.header("x-audio-duration-ms");
    if (h) audioDurationMs = Number(h) || 0;
  }

  const defaults = getDefaultModels();
  if (!defaults.voice) {
    return c.json(
      {
        error: "No voice model configured. Go to Settings > Models to add one.",
      },
      400,
    );
  }

  let rawText: string;
  let transcribeDurationInSeconds: number | undefined;
  const language = getLanguageSetting();
  const api = await createHookApi();

  // Plugin hook: preprocess the recorded audio, or override which provider,
  // model, language, or ASR vocabulary bias transcribes this dictation.
  // Runs before any provider/key resolution so overrides actually take
  // effect. `api.control.consume()` here skips STT entirely.
  const parsedAppContext = parseAppContext(appContext);
  const beforeTranscribeOutput = await plugins().run(
    "beforeTranscribe",
    {
      providerId: defaults.voice.provider,
      modelId: defaults.voice.model_id,
      audioDurationMs,
      ...(parsedAppContext ? { appContext: parsedAppContext } : {}),
    },
    {
      audio: audioData,
      providerId: defaults.voice.provider,
      modelId: defaults.voice.model_id,
    },
    api,
  );
  audioData = beforeTranscribeOutput.audio;
  const voiceProvider = beforeTranscribeOutput.providerId;
  const voiceModel = beforeTranscribeOutput.modelId;
  const languageOverride = beforeTranscribeOutput.language;

  // A plugin consumed/aborted the dictation in a server hook: return blank
  // output so any client suppresses delivery, carry the disposition/reason,
  // and (on abort) emit the documented `pipelineError` event exactly once.
  const suppressedResponse = () => {
    emitAbortEvent(api, PipelineStage.Transcribe);
    return c.json({
      raw: "",
      cleaned: "",
      model: voiceModel,
      durationMs: Date.now() - start,
      audioDurationMs,
      disposition: dispositionFromControl(api.control.state),
      ...(api.control.reason ? { reason: api.control.reason } : {}),
    });
  };

  if (api.control.state !== "running") {
    return suppressedResponse();
  }

  const provider = getProvider(voiceProvider);
  if (!provider) {
    return c.json(
      { error: `Unsupported transcription provider: ${voiceProvider}` },
      400,
    );
  }

  const apiKey = getApiKeyForProvider(voiceProvider);
  if (!apiKey) {
    // Freestyle Cloud has no stored key — a null token means "signed out".
    if (voiceProvider === FREESTYLE_CLOUD_PROVIDER_ID) {
      return c.json({ error: "cloud_auth_required" }, 401);
    }
    return c.json(
      { error: `No API key configured for provider: ${voiceProvider}` },
      400,
    );
  }

  const skipPostProcess = c.req.header("x-skip-post-process") === "true";
  const freestyleCleanupActive =
    !skipPostProcess &&
    defaults.llm?.provider === FREESTYLE_CLOUD_PROVIDER_ID &&
    readSetting("llm_cleanup") === "true";

  // Freestyle Cloud's combined STT+cleanup mode does its work remotely, so
  // `afterTranscribe`/`beforeCleanup` never fire for it. When a plugin
  // implements one of those hooks, fall back to cloud's raw STT mode + the
  // normal local post-process path (one extra round trip) so hook firing
  // stays provider-independent. Otherwise keep the faster combined mode.
  const pluginNeedsTranscribeHooks =
    plugins().has("afterTranscribe") || plugins().has("beforeCleanup");

  if (voiceProvider === FREESTYLE_CLOUD_PROVIDER_ID && freestyleCleanupActive) {
    const useCombined = !pluginNeedsTranscribeHooks;
    try {
      // A `beforeTranscribe` plugin can override the ASR vocabulary bias; honor
      // it on the cloud path too (else fall back to the user's DB vocabulary),
      // so the override behaves the same regardless of provider.
      const vocabulary = beforeTranscribeOutput.bias
        ? { terms: beforeTranscribeOutput.bias }
        : getCloudVocabularyBias();
      const result = await transcribeWithFreestyleCloud({
        token: apiKey,
        audio: audioData,
        language: languageOverride ?? language,
        appContext,
        mode: useCombined ? "combined" : "raw",
        vocabulary,
        ...(useCombined ? getEffectiveCleanupTones() : {}),
        appAssignments: getCleanupAppAssignments(),
      });
      rawText = sanitizeTranscriptText(result.raw ?? "");

      if (useCombined) {
        // The cloud already ran STT + LLM cleanup; still apply the
        // local-only dictionary replacements and `afterCleanup` plugin hook
        // on the way out.
        const cleaned = await applyFinalRewrites(
          sanitizeTranscriptText(result.cleaned ?? rawText),
          appContext,
          rawText,
          api,
        );
        // An `afterCleanup` plugin can consume/abort here too. Terminal
        // control state suppresses delivery on every path, so blank the
        // output rather than returning text the pipeline decided to drop.
        if (api.control.state !== "running") {
          return suppressedResponse();
        }
        const durationMs = Date.now() - start;
        const inputTokens = result.usage?.inputTokens ?? 0;
        const outputTokens = result.usage?.outputTokens ?? 0;

        try {
          saveProcessedHistory({
            rawText,
            cleanedText: cleaned !== rawText ? cleaned : null,
            voiceProvider,
            voiceModel,
            llmProvider: FREESTYLE_CLOUD_PROVIDER_ID,
            llmModel: defaults.llm?.model_id ?? "freestyle-cloud/post-process",
            durationMs,
            audioDurationMs,
            inputTokens,
            outputTokens,
            costUsd: 0,
          });
        } catch (err) {
          log.error(`Failed to save history: ${err}`);
        }

        capture("transcription completed", {
          provider: voiceProvider,
          provider_category: routeVoiceProviderCategory(voiceProvider),
          model: voiceModel,
          duration_ms: durationMs,
          audio_duration_ms: audioDurationMs,
          post_processed: true,
          llm_provider: FREESTYLE_CLOUD_PROVIDER_ID,
          llm_model: defaults.llm?.model_id,
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          cost_usd: 0,
        });

        return c.json({
          raw: rawText,
          cleaned,
          model: voiceModel,
          provider_category: routeVoiceProviderCategory(voiceProvider),
          durationMs,
          disposition: dispositionFromControl(api.control.state),
        });
      }

      // Raw-mode fallback: run the same afterTranscribe hook + shared
      // post-process path used by the local/BYOK flow below.
      rawText = (
        await plugins().run(
          "afterTranscribe",
          {
            providerId: voiceProvider,
            modelId: voiceModel,
            appContext: parsedAppContext,
          },
          { text: rawText },
          api,
        )
      ).text;
    } catch (err) {
      if (err instanceof FreestyleCloudAuthError) {
        invalidateSession();
        return c.json({ error: "cloud_auth_required" }, 401);
      }
      if (err instanceof FreestyleCloudUsageError) {
        return c.json({ error: "usage_exceeded", resetsAt: err.resetsAt }, 429);
      }
      log.error(
        `cloud transcribe failed (${voiceProvider}/${voiceModel}): ${formatError(err)}`,
      );
      // Transient network faults / upstream 5xx aren't app defects — surface
      // them to the user but don't report them to error tracking.
      if (!isTransientCloudError(err)) {
        captureException(err, { provider: voiceProvider, model: voiceModel });
      }
      return c.json(
        {
          error: "Transcription failed",
          detail: err instanceof Error ? err.message : String(err),
        },
        500,
      );
    }
  } else {
    try {
      // A plugin-provided bias list is a set of raw terms — rebuild the
      // provider-specific structure from them rather than the DB vocabulary.
      const bias = beforeTranscribeOutput.bias
        ? buildAsrVocabularyBias(
            voiceProvider,
            voiceModel,
            beforeTranscribeOutput.bias,
          )
        : resolveAsrVocabularyBias(voiceProvider, voiceModel);
      log.debug(`bias=${JSON.stringify(bias)}`);
      const t0 = Date.now();
      const result = await provider.transcribe({
        audio: audioData,
        model: voiceModel,
        apiKey,
        ...((languageOverride ?? language)
          ? { language: languageOverride ?? language }
          : {}),
        bias,
      });
      rawText = sanitizeTranscriptText(result.text);

      // Plugin hook: rewrite the raw transcript before cleanup.
      rawText = (
        await plugins().run(
          "afterTranscribe",
          {
            providerId: voiceProvider,
            modelId: voiceModel,
            appContext: parsedAppContext,
          },
          { text: rawText },
          api,
        )
      ).text;
      transcribeDurationInSeconds = result.durationInSeconds;

      log.debug(
        `STT took ${Date.now() - t0}ms | rawText=${JSON.stringify(rawText).slice(0, 120)}`,
      );
    } catch (err) {
      // Expired/invalid cloud session — ask the desktop app to re-authenticate.
      if (err instanceof CloudAuthError) {
        invalidateSession();
        return c.json({ error: "cloud_auth_required" }, 401);
      }
      log.error(
        `transcribe failed (${voiceProvider}/${voiceModel}): ${formatError(err)}`,
      );
      if (!isTransientCloudError(err)) {
        captureException(err, { provider: voiceProvider, model: voiceModel });
      }
      void plugins().emit({
        type: FreestyleEventType.PipelineError,
        stage: PipelineStage.Transcribe,
        message: err instanceof Error ? err.message : String(err),
      });
      capture("transcription failed", {
        provider: voiceProvider,
        provider_category: routeVoiceProviderCategory(voiceProvider),
        model: voiceModel,
        error: err instanceof Error ? err.message : String(err),
      });
      return c.json(
        {
          error: "Transcription failed",
          detail: err instanceof Error ? err.message : String(err),
        },
        500,
      );
    }
  }

  const durationMs = Date.now() - start;

  if (!rawText.trim() || api.control.state !== "running") {
    return suppressedResponse();
  }

  void plugins().emit({
    type: FreestyleEventType.Transcribed,
    text: rawText,
    ...(transcribeDurationInSeconds !== undefined
      ? { durationInSeconds: transcribeDurationInSeconds }
      : {}),
  });

  if (skipPostProcess) {
    try {
      saveRawHistory({
        rawText,
        voiceProvider,
        voiceModel,
        durationMs,
        audioDurationMs,
      });
    } catch (err) {
      log.error(`Failed to save history: ${err}`);
    }

    capture("transcription completed", {
      provider: voiceProvider,
      provider_category: routeVoiceProviderCategory(voiceProvider),
      model: voiceModel,
      duration_ms: durationMs,
      audio_duration_ms: audioDurationMs,
      post_processed: false,
    });

    return c.json({
      raw: rawText,
      cleaned: rawText,
      model: voiceModel,
      provider_category: routeVoiceProviderCategory(voiceProvider),
      durationMs,
    });
  }

  const ppStart = Date.now();
  let pp: Awaited<ReturnType<typeof postProcess>>;
  try {
    pp = await postProcess(rawText, appContext, {
      language,
      source: "batch",
      api,
    });
  } catch (err) {
    if (err instanceof FreestyleCloudAuthError) {
      invalidateSession();
      return c.json({ error: "cloud_auth_required" }, 401);
    }
    if (err instanceof FreestyleCloudUsageError) {
      return c.json({ error: "usage_exceeded", resetsAt: err.resetsAt }, 429);
    }
    throw err;
  }
  log.debug(
    `post-process took ${Date.now() - ppStart}ms | cleaned=${JSON.stringify(pp.cleaned).slice(0, 120)}`,
  );

  // STT and cleanup ran on separate models, so the user-perceived latency is
  // the full request → cleaned text. `durationMs` above is STT-only; recompute
  // now so history, analytics, and the response all report the same total.
  const totalDurationMs = Date.now() - start;

  try {
    saveProcessedHistory({
      rawText,
      cleanedText: pp.cleaned !== rawText ? pp.cleaned : null,
      voiceProvider,
      voiceModel,
      llmProvider: pp.llmProvider,
      llmModel: pp.llmModel,
      durationMs: totalDurationMs,
      audioDurationMs,
      inputTokens: pp.inputTokens,
      outputTokens: pp.outputTokens,
      costUsd: pp.costUsd,
    });
  } catch (err) {
    log.error(`Failed to save history: ${err}`);
  }

  log.debug(`total ${totalDurationMs}ms`);

  capture("transcription completed", {
    provider: voiceProvider,
    provider_category: routeVoiceProviderCategory(voiceProvider),
    model: voiceModel,
    duration_ms: totalDurationMs,
    audio_duration_ms: audioDurationMs,
    post_processed: true,
    llm_provider: pp.llmProvider,
    llm_model: pp.llmModel,
    input_tokens: pp.inputTokens,
    output_tokens: pp.outputTokens,
    cost_usd: pp.costUsd,
  });

  // `beforeCleanup`/`afterCleanup` run inside postProcess, after the
  // raw-stage guard above — a consume/abort there still needs to suppress
  // delivery. Blank the output so any client drops it even if it ignores
  // `disposition`, and emit the abort event on that path too.
  const suppressed = api.control.state !== "running";
  emitAbortEvent(api, PipelineStage.Transcribe);
  return c.json({
    raw: suppressed ? "" : rawText,
    cleaned: suppressed ? "" : pp.cleaned,
    model: voiceModel,
    provider_category: routeVoiceProviderCategory(voiceProvider),
    durationMs: totalDurationMs,
    audioDurationMs,
    llmModel: pp.llmModel,
    inputTokens: pp.inputTokens,
    outputTokens: pp.outputTokens,
    costUsd: pp.costUsd,
    disposition: dispositionFromControl(api.control.state),
  });
});

export default transcribeRoute;

/**
 * Pre-warm the local ASR server for the currently-selected voice model so it
 * loads while the user is still speaking, instead of stalling at submission.
 *
 * The client fires this fire-and-forget on recording start. We dispatch on the
 * default voice provider: only local engines (whisper/mlx) need warming, and
 * each has its own availability gate. Cloud/BYOK providers are a cheap no-op.
 * The underlying `startInBackground` helpers are themselves fire-and-forget and
 * no-op when the server is already warm, so repeated calls are safe.
 *
 * Kept as a separate router (mounted alongside `transcribeRoute` at
 * `/transcribe`) so it can be added to the typed RPC surface without reindenting
 * the large batch-transcribe handler above.
 */
export const transcribePreWarmRoute = new Hono().post("/pre-warm", (c) => {
  try {
    // Warm the cleanup LLM connection while the user is still speaking, so the
    // post-transcription handoff reuses a hot socket. Independent of the voice
    // provider; a no-op unless cleanup is enabled and the configured provider
    // supports prewarming (e.g. Groq).
    prewarmPostProcess();

    const defaults = getDefaultModels();
    const provider = defaults.voice?.provider;

    // Warm the Freestyle Cloud TLS connection when this dictation will reach the
    // cloud — cloud voice (the transcribe POST) or cloud cleanup (when cleanup
    // is enabled). undici pools the socket by origin for the real request.
    const cloudCleanup =
      defaults.llm?.provider === FREESTYLE_CLOUD_PROVIDER_ID &&
      readSetting("llm_cleanup") === "true";
    if (provider === FREESTYLE_CLOUD_PROVIDER_ID || cloudCleanup) {
      const token = getApiKeyForProvider(FREESTYLE_CLOUD_PROVIDER_ID);
      if (token) prewarmFreestyleCloudConnection(token);
    }

    if (!defaults.voice || !provider) {
      return c.json({ ok: true, warming: null });
    }

    const modelId = stripProviderPrefix(defaults.voice.model_id);

    if (provider === WHISPER_PROVIDER_ID) {
      if (!isServerBinaryAvailable()) {
        return c.json({ ok: true, warming: null });
      }
      startInBackground(modelId);
      return c.json({ ok: true, warming: "whisper" });
    }

    if (provider === MLX_ASR_PROVIDER_ID) {
      if (!canRunMlxAsr()) return c.json({ ok: true, warming: null });
      if (getMlxModelStatus(modelId)?.status !== "ready") {
        return c.json({ ok: true, warming: null });
      }
      startMlxInBackground(modelId);
      return c.json({ ok: true, warming: "mlx" });
    }

    return c.json({ ok: true, warming: null });
  } catch {
    // Best-effort warmup — DB not ready or any other init issue is non-fatal;
    // the lazy start at submission time remains the fallback.
    return c.json({ ok: true, warming: null });
  }
});
