import { Hono } from "hono";
import { cors } from "hono/cors";
import { reconcileUnsupportedMlxVoiceDefault } from "./lib/mlx-asr/reconcile.js";
import { captureException, initSentry } from "./lib/sentry.js";
import apiKeys from "./routes/api-keys.js";
import dictionary from "./routes/dictionary.js";
import formats from "./routes/formats.js";
import history from "./routes/history.js";
import mcp from "./routes/mcp.js";
import mlxAsr, { autoStartMlxAsrServer } from "./routes/mlx-asr.js";
import models from "./routes/models.js";
import postProcessRoute from "./routes/post-process-route.js";
import settings from "./routes/settings.js";
import stream from "./routes/stream.js";
import transcribe from "./routes/transcribe.js";
import vocabulary from "./routes/vocabulary.js";
import whisper, { autoStartWhisperServer } from "./routes/whisper.js";

initSentry();

setTimeout(() => reconcileUnsupportedMlxVoiceDefault(), 500);
setTimeout(() => autoStartWhisperServer(), 1000);
setTimeout(() => autoStartMlxAsrServer(), 1500);

const app = new Hono()
  // CORS for renderer requests (skip WebSocket upgrades)
  .use("*", async (c, next) => {
    if (c.req.header("upgrade")?.toLowerCase() === "websocket") {
      return next();
    }
    return cors()(c, next);
  })
  .onError((err, c) => {
    captureException(err);
    return c.json({ error: "Internal server error" }, 500);
  })
  .get("/", (c) => {
    return c.text("Freestyle API");
  })
  .get("/api/health", (c) => {
    return c.json({ status: "ok", name: "freestyle" });
  })
  .route("/api/settings", settings)
  .route("/api/keys", apiKeys)
  .route("/api/models", models)
  .route("/api/transcribe", transcribe)
  .route("/api/history", history)
  .route("/api/dictionary", dictionary)
  .route("/api/vocabulary", vocabulary)
  .route("/api/formats", formats)
  .route("/api/post-process", postProcessRoute)
  .route("/api/whisper", whisper)
  .route("/api/mlx-asr", mlxAsr)
  .route("/mcp", mcp)
  .route("/stream", stream);

export type AppType = typeof app;

export default app;
