import { Hono } from "hono";
import {
  isBinaryAvailable,
  isServerBinaryAvailable,
} from "../lib/whisper/binary.js";
import { getModelsDir, WHISPER_MODELS } from "../lib/whisper/constants.js";
import {
  cancelDownload,
  clearDownloadError,
  deleteModel,
  downloadModel,
  getAllModelStatuses,
  getModelStatus,
} from "../lib/whisper/models.js";
import { isServerRunning, stopServer } from "../lib/whisper/server.js";

const whisper = new Hono()
  .get("/status", (c) => {
    return c.json({
      binaryAvailable: isBinaryAvailable(),
      serverBinaryAvailable: isServerBinaryAvailable(),
      serverRunning: isServerRunning(),
      modelsDir: getModelsDir(),
      models: getAllModelStatuses(),
      modelDefinitions: WHISPER_MODELS.map((m) => ({
        id: m.id,
        displayName: m.displayName,
        sizeBytes: m.sizeBytes,
        ramRequired: m.ramRequired,
        speed: m.speed,
        quality: m.quality,
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
    return c.json({ ok: deleted });
  })
  .post("/server/stop", async (c) => {
    await stopServer();
    return c.json({ ok: true });
  });

export default whisper;
