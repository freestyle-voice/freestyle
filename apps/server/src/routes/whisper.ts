import { createAppLogger } from "@freestyle/utils";
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
  WHISPER_MODELS,
  WHISPER_PROVIDER_ID,
} from "../lib/whisper/constants.js";
import {
  cancelDownload,
  clearDownloadError,
  deleteModel,
  downloadModel,
  getAllModelStatuses,
  getModelStatus,
  isBinaryDownloading,
} from "../lib/whisper/models.js";
import {
  isServerFailed,
  isServerRunning,
  startInBackground,
  stopServer,
} from "../lib/whisper/server.js";

const log = createAppLogger("whisper");

const whisper = new Hono()
  .get("/status", (c) => {
    return c.json({
      binaryAvailable: isBinaryAvailable(),
      binaryDownloading: isBinaryDownloading(),
      serverBinaryAvailable: isServerBinaryAvailable(),
      serverRunning: isServerRunning(),
      serverFailed: isServerFailed(),
      modelsDir: getModelsDir(),
      models: getAllModelStatuses(),
      modelDefinitions: WHISPER_MODELS.map((m) => ({
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
  .delete("/models/:model", (c) => {
    const modelId = c.req.param("model");
    const deleted = deleteModel(modelId);

    if (deleted) {
      capture("whisper model deleted", { model_id: modelId });
    }

    return c.json({ ok: deleted });
  })
  .post("/server/start", async (c) => {
    const body = await c.req
      .json<{ modelId?: string }>()
      .catch(() => ({ modelId: undefined }));
    let modelId = body.modelId;

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

export function autoStartWhisperServer(): void {
  try {
    const defaults = getDefaultModels();
    if (defaults.voice?.provider !== WHISPER_PROVIDER_ID) return;
    if (!isServerBinaryAvailable()) return;

    const modelId = stripProviderPrefix(defaults.voice.model_id);
    log.debug(`Auto-starting server for model: ${modelId}`);
    startInBackground(modelId);
  } catch {
    // DB not ready or other init issue — silently skip
  }
}
