import { experimental_transcribe as transcribe } from "ai";
import { Hono } from "hono";
import { getDb } from "../lib/db.js";
import { postProcess } from "../lib/post-process.js";
import {
  createTranscriptionModel,
  getDefaultModels,
} from "../lib/providers.js";

const transcribeRoute = new Hono().post("/", async (c) => {
  const start = Date.now();

  // Get audio from request body
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

  // Get context header (JSON with app, url, title)
  const appContext = c.req.header("x-app-context") ?? null;

  // Get configured models
  const defaults = getDefaultModels();
  if (!defaults.voice) {
    return c.json(
      {
        error: "No voice model configured. Go to Settings > Models to add one.",
      },
      400,
    );
  }

  // Step 1: Transcribe
  const db = getDb();
  let rawText: string;

  const langSetting = db
    .prepare("SELECT value FROM settings WHERE key = 'language'")
    .get() as { value: string } | undefined;
  const language = langSetting?.value || undefined;

  try {
    const model = createTranscriptionModel(
      defaults.voice.provider,
      defaults.voice.model_id,
    );
    const result = await transcribe({
      model: model as Parameters<typeof transcribe>[0]["model"],
      audio: audioData,
      ...(language && language !== "auto" ? { language } : {}),
    });
    rawText = result.text;
  } catch (err) {
    return c.json(
      {
        error: "Transcription failed",
        detail: err instanceof Error ? err.message : String(err),
      },
      500,
    );
  }

  if (!rawText.trim()) {
    return c.json({
      raw: "",
      cleaned: "",
      model: defaults.voice.model_id,
      durationMs: Date.now() - start,
    });
  }

  // Step 2: LLM post-processing + dictionary replacements
  const pp = await postProcess(rawText, appContext);
  const durationMs = Date.now() - start;

  // Save to history
  try {
    db.prepare(
      `INSERT INTO transcription_history
         (raw_text, cleaned_text, voice_provider, voice_model, llm_provider, llm_model, duration_ms, input_tokens, output_tokens, cost_usd)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      rawText,
      pp.cleaned !== rawText ? pp.cleaned : null,
      defaults.voice.provider,
      defaults.voice.model_id,
      pp.llmProvider,
      pp.llmModel,
      durationMs,
      pp.inputTokens,
      pp.outputTokens,
      pp.costUsd,
    );
  } catch (err) {
    console.error("Failed to save history:", err);
  }

  return c.json({
    raw: rawText,
    cleaned: pp.cleaned,
    model: defaults.voice.model_id,
    durationMs,
  });
});

export default transcribeRoute;
