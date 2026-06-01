import { Hono } from "hono";
import {
  isAppleSiliconMac,
  MLX_ASR_MODELS,
  MLX_ASR_PROVIDER_ID,
  MLX_ASR_PROVIDER_NAME,
  MLX_UNSUPPORTED_PLATFORM_REASON,
} from "../lib/mlx-asr/constants.js";
import {
  cancelMlxDownload,
  clearMlxDownloadError,
  deleteMlxModel,
  downloadMlxModel,
  getAllMlxModelStatuses,
  getMlxModelStatus,
} from "../lib/mlx-asr/models.js";
import {
  describeMlxSetupBlocker,
  findPythonExecutable,
  getMlxAsrServerScriptPath,
  getMlxAsrWorkerPath,
  isMlxAudioInstalled,
  resetPythonProbe,
} from "../lib/mlx-asr/python.js";
import {
  getMlxRuntimeDownloadStatus,
  isMlxRuntimeInstallable,
} from "../lib/mlx-asr/runtime.js";
import {
  canRunMlxAsr,
  getMlxAsrKeepAliveMinutes,
  isMlxServerFailed,
  isMlxServerRunning,
  startMlxInBackground,
  stopMlxServer,
} from "../lib/mlx-asr/server.js";
import { getDefaultModels } from "../lib/providers.js";
import { stripProviderPrefix } from "../lib/streaming/types.js";

const mlxAsr = new Hono()
  .get("/status", (c) => {
    if (c.req.query("refresh") === "1") {
      resetPythonProbe();
    }

    const platformSupported = isAppleSiliconMac();
    const python = findPythonExecutable();
    const scriptPath = getMlxAsrServerScriptPath() || null;
    const workerPath = getMlxAsrWorkerPath() || null;
    const mlxAudio = python ? isMlxAudioInstalled(python) : false;
    const blockedReason = platformSupported
      ? describeMlxSetupBlocker()
      : MLX_UNSUPPORTED_PLATFORM_REASON;

    return c.json({
      platformSupported,
      pythonAvailable: Boolean(python),
      pythonPath: python,
      scriptPath,
      workerPath,
      mlxAudioInstalled: mlxAudio,
      canRun: canRunMlxAsr(),
      blockedReason,
      serverRunning: isMlxServerRunning(),
      serverFailed: isMlxServerFailed(),
      keepAliveMinutes: getMlxAsrKeepAliveMinutes(),
      runtime: getMlxRuntimeDownloadStatus(),
      models: platformSupported ? getAllMlxModelStatuses() : [],
      modelDefinitions: platformSupported
        ? MLX_ASR_MODELS.map((m) => ({
            id: m.id,
            hfId: m.hfId,
            family: m.family,
            displayName: m.displayName,
            sizeBytes: m.sizeBytes,
            ramRequired: m.ramRequired,
            speed: m.speed,
            quality: m.quality,
            quantized: m.quantized,
          }))
        : [],
      setupHint: platformSupported
        ? (blockedReason ??
          `Press Download on a ${MLX_ASR_PROVIDER_NAME} model to fetch weights.`)
        : MLX_UNSUPPORTED_PLATFORM_REASON,
    });
  })
  .post("/models/:model/download", async (c) => {
    const modelId = c.req.param("model");

    const status = getMlxModelStatus(modelId);
    if (!status) {
      return c.json({ error: `Unknown MLX ASR model: ${modelId}` }, 400);
    }

    if (status.status === "ready") {
      return c.json({ ok: true, message: "Model already downloaded" });
    }

    if (status.status === "downloading") {
      return c.json({ ok: true, message: "Download already in progress" });
    }

    if (
      status.status === "error" &&
      !canRunMlxAsr() &&
      !isMlxRuntimeInstallable()
    ) {
      return c.json({ error: status.error ?? "MLX ASR is not available" }, 400);
    }

    clearMlxDownloadError(modelId);
    downloadMlxModel(modelId).catch(() => {});

    return c.json({ ok: true, message: "Download started" });
  })
  .post("/models/:model/cancel", (c) => {
    const modelId = c.req.param("model");
    const cancelled = cancelMlxDownload(modelId);
    return c.json({ ok: cancelled });
  })
  .delete("/models/:model", (c) => {
    const modelId = c.req.param("model");
    const deleted = deleteMlxModel(modelId);
    return c.json({ ok: deleted });
  })
  .post("/server/start", async (c) => {
    const body = await c.req
      .json<{ modelId?: string }>()
      .catch(() => ({ modelId: undefined }));
    let modelId = body.modelId;

    if (!modelId) {
      const defaults = getDefaultModels();
      if (defaults.voice?.provider === MLX_ASR_PROVIDER_ID) {
        modelId = stripProviderPrefix(defaults.voice.model_id);
      }
    }

    if (!modelId) {
      return c.json({ error: "No model specified" }, 400);
    }

    if (!canRunMlxAsr()) {
      return c.json(
        {
          error:
            describeMlxSetupBlocker() ??
            "MLX ASR is not available. Install Python 3.12+ and mlx-audio (pip install mlx-audio).",
        },
        400,
      );
    }

    const status = getMlxModelStatus(modelId);
    if (!status || status.status !== "ready") {
      return c.json({ error: "MLX ASR model is not downloaded yet." }, 400);
    }

    startMlxInBackground(modelId);
    return c.json({ ok: true });
  })
  .post("/server/stop", async (c) => {
    await stopMlxServer();
    return c.json({ ok: true });
  });

export default mlxAsr;

export function autoStartMlxAsrServer(): void {
  try {
    const defaults = getDefaultModels();
    if (defaults.voice?.provider !== MLX_ASR_PROVIDER_ID) return;
    if (!canRunMlxAsr()) {
      if (process.env.NODE_ENV !== "production") {
        console.log(
          "[mlx-asr] Skipping auto-start — Python or mlx-audio not available",
        );
      }
      return;
    }

    const modelId = stripProviderPrefix(defaults.voice.model_id);
    if (getMlxModelStatus(modelId)?.status !== "ready") return;
    if (process.env.NODE_ENV !== "production") {
      console.log("[mlx-asr] Auto-starting server for model:", modelId);
    }
    startMlxInBackground(modelId);
  } catch {
    // DB not ready — skip
  }
}
