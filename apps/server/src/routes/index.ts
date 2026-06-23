import { createAppLogger } from "@freestyle/utils";
import { Hono } from "hono";
import { capture, captureException, getDeviceId } from "../lib/posthog.js";
import apiKeys from "./api-keys.js";
import auth from "./auth.js";
import dictionary from "./dictionary.js";
import formats from "./formats.js";
import history from "./history.js";
import mcp from "./mcp.js";
import mlxAsr from "./mlx-asr.js";
import models from "./models.js";
import postProcessRoute from "./post-process-route.js";
import settings from "./settings.js";
import stream from "./stream.js";
import transcribe from "./transcribe.js";
import vocabulary from "./vocabulary.js";
import whisper from "./whisper.js";

const clientLog = createAppLogger("renderer");

const apiRouter = new Hono()
  .get("/health", (c) => c.json({ status: "ok", name: "freestyle" }))
  .get("/device-id", (c) => c.json({ deviceId: getDeviceId() }))
  // Renderer-side telemetry (e.g. onboarding UI events) funnels through the
  // same server-side capture() as every other product event, so it honors the
  // telemetry opt-out, DO_NOT_TRACK, and device-id attribution in one place.
  .post("/telemetry", async (c) => {
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
  // Crash/error reports from the renderer (window.onerror, unhandled
  // rejections, React error boundary). Always persisted to the local log file
  // for diagnostics; PostHog reporting is gated by the telemetry opt-out inside
  // captureException. Only message/stack/source/context are accepted — callers
  // must never include transcript or clipboard text.
  .post("/client-error", async (c) => {
    const body = (await c.req.json().catch(() => null)) as {
      message?: unknown;
      stack?: unknown;
      source?: unknown;
      context?: unknown;
    } | null;
    if (!body || typeof body.message !== "string" || !body.message) {
      return c.json({ error: "message required" }, 400);
    }

    const source = typeof body.source === "string" ? body.source : "renderer";
    const stack = typeof body.stack === "string" ? body.stack : undefined;
    const context =
      body.context && typeof body.context === "object"
        ? (body.context as Record<string, unknown>)
        : undefined;

    clientLog.error(`[${source}] ${body.message}${stack ? `\n${stack}` : ""}`);

    const err = new Error(body.message);
    if (stack) err.stack = stack;
    captureException(err, { source, ...context });

    return c.json({ ok: true });
  })
  .route("/settings", settings)
  .route("/keys", apiKeys)
  .route("/auth", auth)
  .route("/models", models)
  .route("/transcribe", transcribe)
  .route("/history", history)
  .route("/dictionary", dictionary)
  .route("/vocabulary", vocabulary)
  .route("/formats", formats)
  .route("/post-process", postProcessRoute)
  .route("/whisper", whisper)
  .route("/mlx-asr", mlxAsr);

const router = new Hono()
  .route("/api", apiRouter)
  .route("/mcp", mcp)
  .route("/stream", stream);

export default router;
