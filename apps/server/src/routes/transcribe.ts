import { createAppLogger } from "@freestyle/utils";
import { Hono } from "hono";
import { getDb, readSetting } from "../lib/db.js";
import { applyDictionaryReplacements } from "../lib/dictionary-replacements.js";
import { sanitizeTranscriptText } from "../lib/editor/model-hints.js";
import {
  FREESTYLE_CLOUD_PROVIDER_ID,
  FreestyleCloudAuthError,
  transcribeWithFreestyleCloud,
} from "../lib/freestyle-cloud.js";
import { saveProcessedHistory, saveRawHistory } from "../lib/history-store.js";
import { getLanguageSetting } from "../lib/language.js";
import {
  FreestyleEventType,
  PipelineStage,
  parseAppContext,
  plugins,
} from "../lib/plugins/index.js";
import { postProcess } from "../lib/post-process.js";
import { capture, captureException } from "../lib/posthog.js";
import { getDefaultModels } from "../lib/providers.js";
import { invalidateSession } from "../lib/sessions.js";
import { CloudAuthError } from "../lib/streaming/providers/freestyle-cloud.js";
import { getProvider } from "../lib/streaming/registry.js";
import { getApiKeyForProvider } from "../lib/streaming-stt.js";
import { resolveAsrVocabularyBias } from "../lib/vocabulary-bias.js";

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

  const appContext = decodeAppContext(c.req.header("x-app-context"));

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

  const db = getDb();
  let rawText: string;
  let transcribeDurationInSeconds: number | undefined;
  const language = getLanguageSetting();

  const provider = getProvider(defaults.voice.provider);
  if (!provider) {
    return c.json(
      {
        error: `Unsupported transcription provider: ${defaults.voice.provider}`,
      },
      400,
    );
  }

  const apiKey = getApiKeyForProvider(defaults.voice.provider);
  if (!apiKey) {
    // Freestyle Cloud has no stored key — a null token means "signed out".
    if (defaults.voice.provider === FREESTYLE_CLOUD_PROVIDER_ID) {
      return c.json({ error: "cloud_auth_required" }, 401);
    }
    return c.json(
      {
        error: `No API key configured for provider: ${defaults.voice.provider}`,
      },
      400,
    );
  }

  const voiceProvider = defaults.voice.provider;
  const voiceModel = defaults.voice.model_id;
  const skipPostProcess = c.req.header("x-skip-post-process") === "true";
  const freestyleCleanupActive =
    !skipPostProcess &&
    defaults.llm?.provider === FREESTYLE_CLOUD_PROVIDER_ID &&
    readSetting("llm_cleanup") === "true";

  if (voiceProvider === FREESTYLE_CLOUD_PROVIDER_ID && freestyleCleanupActive) {
    try {
      const result = await transcribeWithFreestyleCloud({
        token: apiKey,
        audio: audioData,
        language,
        appContext,
        mode: "combined",
      });
      rawText = sanitizeTranscriptText(result.raw ?? "");
      const cleaned = applyDictionaryReplacements(
        sanitizeTranscriptText(result.cleaned ?? rawText),
        db,
      );
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
      });
    } catch (err) {
      if (err instanceof FreestyleCloudAuthError) {
        invalidateSession();
        return c.json({ error: "cloud_auth_required" }, 401);
      }
      captureException(err, { provider: voiceProvider, model: voiceModel });
      return c.json(
        {
          error: "Transcription failed",
          detail: err instanceof Error ? err.message : String(err),
        },
        500,
      );
    }
  }

  try {
    const bias = resolveAsrVocabularyBias(
      defaults.voice.provider,
      defaults.voice.model_id,
    );
    log.debug(`bias=${JSON.stringify(bias)}`);
    const t0 = Date.now();
    const result = await provider.transcribe({
      audio: audioData,
      model: defaults.voice.model_id,
      apiKey,
      ...(language ? { language } : {}),
      bias,
    });
    rawText = sanitizeTranscriptText(result.text);

    // Plugin hook: rewrite the raw transcript before cleanup.
    rawText = (
      await plugins().run(
        "afterTranscribe",
        {
          providerId: defaults.voice.provider,
          modelId: defaults.voice.model_id,
          appContext: parseAppContext(appContext),
        },
        { text: rawText },
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
    captureException(err, {
      provider: defaults.voice.provider,
      model: defaults.voice.model_id,
    });
    void plugins().emit({
      type: FreestyleEventType.PipelineError,
      stage: PipelineStage.Transcribe,
      message: err instanceof Error ? err.message : String(err),
    });
    capture("transcription failed", {
      provider: defaults.voice.provider,
      provider_category: routeVoiceProviderCategory(defaults.voice.provider),
      model: defaults.voice.model_id,
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

  const durationMs = Date.now() - start;

  if (!rawText.trim()) {
    return c.json({
      raw: "",
      cleaned: "",
      model: defaults.voice.model_id,
      durationMs,
    });
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
    });
  } catch (err) {
    if (err instanceof FreestyleCloudAuthError) {
      invalidateSession();
      return c.json({ error: "cloud_auth_required" }, 401);
    }
    throw err;
  }
  log.debug(
    `post-process took ${Date.now() - ppStart}ms | cleaned=${JSON.stringify(pp.cleaned).slice(0, 120)}`,
  );

  try {
    saveProcessedHistory({
      rawText,
      cleanedText: pp.cleaned !== rawText ? pp.cleaned : null,
      voiceProvider,
      voiceModel,
      llmProvider: pp.llmProvider,
      llmModel: pp.llmModel,
      durationMs: Date.now() - start,
      audioDurationMs,
      inputTokens: pp.inputTokens,
      outputTokens: pp.outputTokens,
      costUsd: pp.costUsd,
    });
  } catch (err) {
    log.error(`Failed to save history: ${err}`);
  }

  log.debug(`total ${Date.now() - start}ms`);

  capture("transcription completed", {
    provider: voiceProvider,
    provider_category: routeVoiceProviderCategory(voiceProvider),
    model: voiceModel,
    duration_ms: durationMs,
    audio_duration_ms: audioDurationMs,
    post_processed: true,
    llm_provider: pp.llmProvider,
    llm_model: pp.llmModel,
    input_tokens: pp.inputTokens,
    output_tokens: pp.outputTokens,
    cost_usd: pp.costUsd,
  });

  return c.json({
    raw: rawText,
    cleaned: pp.cleaned,
    model: voiceModel,
    provider_category: routeVoiceProviderCategory(voiceProvider),
    durationMs,
  });
});

export default transcribeRoute;
