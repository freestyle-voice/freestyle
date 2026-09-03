import { serverStartSchema } from "@freestyle-voice/validations";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { capture } from "../lib/posthog.js";
import { getDefaultModels } from "../lib/providers.js";
import { stripProviderPrefix } from "../lib/streaming/types.js";
import {
  isBinaryAvailable,
  isServerBinaryAvailable,
} from "../lib/whisper/binary.js";

import {
  getModelsDir,
  isSupportedWhisperArch,
  unsupportedArchMessage,
  WHISPER_PROVIDER_ID,
} from "../lib/whisper/constants.js";
import {
  cancelDownload,
  clearDownloadError,
  deleteModel,
  downloadModel,
  getAllModelStatuses,
  getCatalogModels,
  getModelStatus,
  isBinaryDownloading,
} from "../lib/whisper/models.js";
import {
  isServerFailed,
  isServerRunning,
  startInBackground,
  stopServer,
} from "../lib/whisper/server.js";

const whisper = new Hono()
  .get("/status", (c) => {
    return c.json({
      archSupported: isSupportedWhisperArch(),
      archUnsupportedReason: isSupportedWhisperArch()
        ? null
        : unsupportedArchMessage(),
      binaryAvailable: isBinaryAvailable(),
      binaryDownloading: isBinaryDownloading(),
      serverBinaryAvailable: isServerBinaryAvailable(),
      serverRunning: isServerRunning(),
      serverFailed: isServerFailed(),
      modelsDir: getModelsDir(),
      models: getAllModelStatuses(),
      modelDefinitions: getCatalogModels().map((m) => ({
        id: m.id,
        displayName: m.displayName,
        sizeBytes: m.sizeBytes,
        ramRequired: m.ramRequired,
        speed: m.speed,
        quality: m.quality,
        quantized: m.quantized,
      })),
    });
  })
  .post("/models/:model/download", async (c) => {
    const modelId = c.req.param("model");

    const status = getModelStatus(modelId);
    if (!status) {
      return c.json({ error: `Unknown model: ${modelId}` }, 400);
    }

    if (status.status === "ready") {
      return c.json({ ok: true, message: "Model already downloaded" });
    }

    if (status.status === "downloading") {
      return c.json({ ok: true, message: "Download already in progress" });
    }

    clearDownloadError(modelId);

    downloadModel(modelId).catch(() => {});

    capture("whisper model download started", { model_id: modelId });

    return c.json({ ok: true, message: "Download started" });
  })
  .post("/models/:model/cancel", (c) => {
    const modelId = c.req.param("model");
    const cancelled = cancelDownload(modelId);
    return c.json({ ok: cancelled });
  })
  .delete("/models/:model", async (c) => {
    const modelId = c.req.param("model");
    const deleted = await deleteModel(modelId);

    if (deleted) {
      capture("whisper model deleted", { model_id: modelId });
    }

    return c.json({ ok: deleted });
  })
  .post("/server/start", zValidator("json", serverStartSchema), async (c) => {
    let modelId = c.req.valid("json").modelId;

    if (!modelId) {
      const defaults = getDefaultModels();
      if (defaults.voice?.provider === WHISPER_PROVIDER_ID) {
        modelId = stripProviderPrefix(defaults.voice.model_id);
      }
    }

    if (!modelId) {
      return c.json({ error: "No model specified" }, 400);
    }

    startInBackground(modelId);
    return c.json({ ok: true });
  })
  .post("/server/stop", async (c) => {
    await stopServer();
    return c.json({ ok: true });
  });

export default whisper;
