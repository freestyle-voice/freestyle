import { createAppLogger } from "@freestyle-voice/utils";
import {
  clientErrorSchema,
  telemetrySchema,
} from "@freestyle-voice/validations";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { capture, captureException, getDeviceId } from "../lib/posthog.js";
import apiKeys from "./api-keys.js";
import auth from "./auth.js";
import dictionary from "./dictionary.js";
import history from "./history.js";
import mlxAsr from "./mlx-asr.js";
import models from "./models.js";
import pluginsRoute from "./plugins.js";
import postProcessRoute from "./post-process-route.js";
import settings from "./settings.js";
import streamRoute from "./stream.js";
import transcribe, { transcribePreWarmRoute } from "./transcribe.js";
import usage from "./usage.js";
import vocabulary from "./vocabulary.js";
import whisper from "./whisper.js";

const clientLog = createAppLogger("renderer");

const apiRouter = new Hono()
  .get("/health", (c) => c.json({ status: "ok", name: "freestyle" }))
  .get("/device-id", (c) => c.json({ deviceId: getDeviceId() }))
  // Renderer-side telemetry (e.g. onboarding UI events) funnels through the
  // same server-side capture() as every other product event, so it honors the
  // telemetry opt-out, DO_NOT_TRACK, and device-id attribution in one place.
  .post("/telemetry", zValidator("json", telemetrySchema), (c) => {
    const { event, properties } = c.req.valid("json");
    capture(event, properties);
    return c.json({ ok: true });
  })
  // Crash/error reports from the renderer (window.onerror, unhandled
  // rejections, React error boundary). Always persisted to the local log file
  // for diagnostics; PostHog reporting is gated by the telemetry opt-out inside
  // captureException. Only message/stack/source/context are accepted — callers
  // must never include transcript or clipboard text.
  .post("/client-error", zValidator("json", clientErrorSchema), (c) => {
    const {
      message,
      stack,
      context,
      source = "renderer",
    } = c.req.valid("json");
    clientLog.error(`[${source}] ${message}${stack ? `\n${stack}` : ""}`);

    const err = new Error(message);
    if (stack) err.stack = stack;
    captureException(err, { source, ...context });

    return c.json({ ok: true });
  })
  .route("/settings", settings)
  .route("/keys", apiKeys)
  .route("/auth", auth)
  .route("/models", models)
  .route("/transcribe", transcribe)
  .route("/transcribe", transcribePreWarmRoute)
  .route("/history", history)
  .route("/dictionary", dictionary)
  .route("/vocabulary", vocabulary)
  .route("/post-process", postProcessRoute)
  .route("/usage", usage)
  .route("/plugins", pluginsRoute)
  .route("/whisper", whisper)
  .route("/mlx-asr", mlxAsr);

const router = new Hono()
  .route("/api", apiRouter)
  .route("/stream", streamRoute);

export default router;
