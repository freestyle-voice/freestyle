import { Hono } from "hono";
import { cors } from "hono/cors";
import { initSentry } from "./lib/sentry.js";
import apiKeys from "./routes/api-keys.js";
import dictionary from "./routes/dictionary.js";
import feedback from "./routes/feedback.js";
import formats from "./routes/formats.js";
import history from "./routes/history.js";
import models from "./routes/models.js";
import settings from "./routes/settings.js";
import stream from "./routes/stream.js";
import transcribe from "./routes/transcribe.js";

// Initialize Sentry as early as possible
initSentry();

const app = new Hono()
  // Allow requests from the Electron renderer (skip for WebSocket upgrades)
  .use("*", async (c, next) => {
    // Don't apply CORS to WebSocket upgrade requests
    if (c.req.header("upgrade")?.toLowerCase() === "websocket") {
      return next();
    }
    return cors()(c, next);
  })
  .get("/", (c) => {
    return c.text("Freestyle API");
  })
  // Mount routes
  .route("/api/settings", settings)
  .route("/api/keys", apiKeys)
  .route("/api/models", models)
  .route("/api/transcribe", transcribe)
  .route("/api/history", history)
  .route("/api/dictionary", dictionary)
  .route("/api/formats", formats)
  .route("/api/feedback", feedback)
  .route("/stream", stream);

export type AppType = typeof app;

export default app;
