import { Hono } from "hono";
import { cors } from "hono/cors";
import { reconcileUnsupportedMlxVoiceDefault } from "./lib/mlx-asr/reconcile.js";
import {
  capture,
  captureException,
  getDeviceId,
  shutdownPosthog,
} from "./lib/posthog.js";
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

process.on("SIGINT", () => shutdownPosthog().finally(() => process.exit(0)));
process.on("SIGTERM", () => shutdownPosthog().finally(() => process.exit(0)));

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
  .get("/api/device-id", (c) => {
    return c.json({ deviceId: getDeviceId() });
  })
  // Renderer-side telemetry (e.g. onboarding UI events) funnels through the
  // same server-side capture() as every other product event, so it honors the
  // telemetry opt-out, DO_NOT_TRACK, and device-id attribution in one place.
  .post("/api/telemetry", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      event?: unknown;
      properties?: unknown;
    } | null;
    if (!body || typeof body.event !== "string" || !body.event) {
      return c.json({ error: "event required" }, 400);
    }
    const properties =
      body.properties && typeof body.properties === "object"
        ? (body.properties as Record<string, unknown>)
        : undefined;
    capture(body.event, properties);
    return c.json({ ok: true });
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

export { closeDb } from "./lib/db.js";
export {
  autoStartMlxAsrServer,
  autoStartWhisperServer,
  reconcileUnsupportedMlxVoiceDefault,
};

export type AppType = typeof app;

export default app;
