import { createAppLogger } from "@freestyle/utils";
import { Hono } from "hono";
import { getDb } from "../lib/db.js";
import { postProcess } from "../lib/post-process.js";
import { capture, captureException } from "../lib/posthog.js";
import { getDefaultModels } from "../lib/providers.js";
import { getProvider } from "../lib/streaming/registry.js";
import { getApiKeyForProvider } from "../lib/streaming-stt.js";
import { resolveAsrVocabularyBias } from "../lib/vocabulary-bias.js";

const log = createAppLogger("transcribe");

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

  const langSetting = db
    .prepare("SELECT value FROM settings WHERE key = 'language'")
    .get() as { value: string } | undefined;
  const language = langSetting?.value || undefined;

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
    return c.json(
      {
        error: `No API key configured for provider: ${defaults.voice.provider}`,
      },
      400,
    );
  }

  try {
    const bias = resolveAsrVocabularyBias(
      defaults.voice.provider,
      defaults.voice.model_id,
    );
    const t0 = Date.now();
    const result = await provider.transcribe({
      audio: audioData,
      model: defaults.voice.model_id,
      apiKey,
      ...(language ? { language } : {}),
      bias,
    });
    rawText = result.text;
    log.debug(
      `STT took ${Date.now() - t0}ms | rawText=${JSON.stringify(rawText).slice(0, 120)}`,
    );
  } catch (err) {
    captureException(err, {
      provider: defaults.voice.provider,
      model: defaults.voice.model_id,
    });
    capture("transcription failed", {
      provider: defaults.voice.provider,
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

  const voiceProvider = defaults.voice.provider;
  const voiceModel = defaults.voice.model_id;
  const skipPostProcess = c.req.header("x-skip-post-process") === "true";

  if (skipPostProcess) {
    Promise.resolve()
      .then(() => {
        db.prepare(
          `INSERT INTO transcription_history
             (raw_text, voice_provider, voice_model, duration_ms, audio_duration_ms)
             VALUES (?, ?, ?, ?, ?)`,
        ).run(
          rawText,
          voiceProvider,
          voiceModel,
          Date.now() - start,
          audioDurationMs,
        );
      })
      .catch((err) => {
        log.error(`Failed to save history: ${err}`);
      });

    capture("transcription completed", {
      provider: voiceProvider,
      model: voiceModel,
      duration_ms: durationMs,
      audio_duration_ms: audioDurationMs,
      post_processed: false,
    });

    return c.json({
      raw: rawText,
      cleaned: rawText,
      model: voiceModel,
      durationMs,
    });
  }

  const ppStart = Date.now();
  const pp = await postProcess(rawText, appContext, "batch");
  log.debug(
    `post-process took ${Date.now() - ppStart}ms | cleaned=${JSON.stringify(pp.cleaned).slice(0, 120)}`,
  );

  Promise.resolve()
    .then(() => {
      db.prepare(
        `INSERT INTO transcription_history
           (raw_text, cleaned_text, voice_provider, voice_model, llm_provider, llm_model, duration_ms, audio_duration_ms, input_tokens, output_tokens, cost_usd)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        rawText,
        pp.cleaned !== rawText ? pp.cleaned : null,
        voiceProvider,
        voiceModel,
        pp.llmProvider,
        pp.llmModel,
        Date.now() - start,
        audioDurationMs,
        pp.inputTokens,
        pp.outputTokens,
        pp.costUsd,
      );
    })
    .catch((err) => {
      log.error(`Failed to save history: ${err}`);
    });

  log.debug(`total ${Date.now() - start}ms`);

  capture("transcription completed", {
    provider: voiceProvider,
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
    durationMs,
  });
});

export default transcribeRoute;
