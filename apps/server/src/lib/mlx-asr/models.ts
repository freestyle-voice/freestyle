import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, readdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getDb } from "../db.js";
import {
  getMlxAsrModel,
  MLX_ASR_MODELS,
  MLX_ASR_PROVIDER_ID,
  type MlxAsrModelDef,
} from "./constants.js";
import {
  describeMlxSetupBlocker,
  findPythonExecutable,
  getMlxAsrServerScriptPath,
  getMlxAsrWorkerPath,
  isMlxAudioInstalled,
  resetPythonProbe,
} from "./python.js";
import {
  cancelMlxRuntimeDownload,
  ensureMlxRuntimeDownloaded,
  getMlxRuntimeDownloadStatus,
  isMlxRuntimeInstallable,
} from "./runtime.js";
import { stopMlxServer } from "./server.js";

export type MlxDownloadStatus =
  | "not_downloaded"
  | "downloading"
  | "verifying"
  | "ready"
  | "error";

export type MlxDownloadPhase = "building_binary" | "downloading_model";

export interface MlxModelDownloadState {
  model: string;
  sizeBytes: number;
  displayName: string;
  status: MlxDownloadStatus;
  phase?: MlxDownloadPhase;
  downloadProgress?: {
    bytesDownloaded: number;
    bytesTotal: number;
    percent: number;
    speedBps: number;
  };
  error?: string;
}

interface ActiveMlxDownload {
  proc: ChildProcess | null;
  phase: MlxDownloadPhase;
  bytesDownloaded: number;
  bytesTotal: number;
  speedBps: number;
  error?: string;
  stderr: string;
}

const activeDownloads = new Map<string, ActiveMlxDownload>();

function baseModelState(
  modelId: string,
  model: MlxAsrModelDef,
): Pick<MlxModelDownloadState, "model" | "sizeBytes" | "displayName"> {
  return {
    model: modelId,
    sizeBytes: model.sizeBytes,
    displayName: model.displayName,
  };
}

function hfCacheRoot(): string {
  return (
    process.env.HUGGINGFACE_HUB_CACHE ??
    (process.env.HF_HOME
      ? join(process.env.HF_HOME, "hub")
      : join(homedir(), ".cache", "huggingface", "hub"))
  );
}

function hfRepoCacheDir(hfId: string): string {
  return join(hfCacheRoot(), `models--${hfId.replaceAll("/", "--")}`);
}

function hasSnapshotFiles(snapshotDir: string): boolean {
  try {
    return readdirSync(snapshotDir).length > 0;
  } catch {
    return false;
  }
}

export function isMlxModelDownloaded(model: MlxAsrModelDef): boolean {
  const snapshotsDir = join(hfRepoCacheDir(model.hfId), "snapshots");
  if (!existsSync(snapshotsDir)) return false;

  try {
    return readdirSync(snapshotsDir, { withFileTypes: true }).some(
      (entry) =>
        entry.isDirectory() && hasSnapshotFiles(join(snapshotsDir, entry.name)),
    );
  } catch {
    return false;
  }
}

function getRunner():
  | { command: string; argsPrefix: string[] }
  | { error: string } {
  const workerPath = getMlxAsrWorkerPath();
  if (existsSync(workerPath)) {
    return { command: workerPath, argsPrefix: [] };
  }

  const python = findPythonExecutable();
  if (!python) {
    return {
      error:
        "Bundled MLX ASR worker or Python 3 not found. Set FREESTYLE_MLX_ASR_WORKER or FREESTYLE_PYTHON.",
    };
  }
  if (!isMlxAudioInstalled(python)) {
    return {
      error: `MLX ASR Python dependencies are not installed for ${python}. Run: ${python} -m pip install mlx-audio`,
    };
  }

  const scriptPath = getMlxAsrServerScriptPath();
  if (!existsSync(scriptPath)) {
    return { error: `MLX ASR worker script not found: ${scriptPath}` };
  }

  return { command: python, argsPrefix: [scriptPath] };
}

export function getMlxModelStatus(
  modelId: string,
): MlxModelDownloadState | null {
  const model = getMlxAsrModel(modelId);
  if (!model) return null;

  const active = activeDownloads.get(modelId);
  if (active?.error) {
    return {
      ...baseModelState(modelId, model),
      status: "error",
      error: active.error,
    };
  }

  if (active) {
    const runtimeProgress =
      active.phase === "building_binary"
        ? getMlxRuntimeDownloadStatus().downloadProgress
        : undefined;
    return {
      ...baseModelState(modelId, model),
      status: "downloading",
      phase: active.phase,
      downloadProgress:
        runtimeProgress ??
        (active.bytesTotal
          ? {
              bytesDownloaded: active.bytesDownloaded,
              bytesTotal: active.bytesTotal,
              percent: Math.round(
                (active.bytesDownloaded / active.bytesTotal) * 100,
              ),
              speedBps: active.speedBps,
            }
          : undefined),
    };
  }

  const blocker = describeMlxSetupBlocker();
  if (blocker) {
    const canDownloadRuntime =
      isMlxRuntimeInstallable() &&
      /worker or Python 3 not found|Python dependencies are not installed/i.test(
        blocker,
      );
    if (canDownloadRuntime) {
      return { ...baseModelState(modelId, model), status: "not_downloaded" };
    }

    return {
      ...baseModelState(modelId, model),
      status: "error",
      error: blocker,
    };
  }

  if (isMlxModelDownloaded(model)) {
    return { ...baseModelState(modelId, model), status: "ready" };
  }

  return { ...baseModelState(modelId, model), status: "not_downloaded" };
}

export function getAllMlxModelStatuses(): MlxModelDownloadState[] {
  return MLX_ASR_MODELS.map((m) => getMlxModelStatus(m.id)!);
}

export function clearMlxDownloadError(modelId: string): void {
  const active = activeDownloads.get(modelId);
  if (active?.error) {
    activeDownloads.delete(modelId);
  }
}

export async function downloadMlxModel(modelId: string): Promise<void> {
  const model = getMlxAsrModel(modelId);
  if (!model) throw new Error(`Unknown MLX ASR model: ${modelId}`);

  const existing = activeDownloads.get(modelId);
  if (existing && !existing.error) {
    throw new Error(`Model ${modelId} is already downloading`);
  }
  if (existing?.error) {
    activeDownloads.delete(modelId);
  }

  if (isMlxModelDownloaded(model)) return;

  const active: ActiveMlxDownload = {
    proc: null,
    phase: "building_binary",
    bytesDownloaded: 0,
    bytesTotal: 0,
    speedBps: 0,
    stderr: "",
  };
  activeDownloads.set(modelId, active);

  let runner = getRunner();
  if ("error" in runner) {
    try {
      await ensureMlxRuntimeDownloaded();
      resetPythonProbe();
      runner = getRunner();
    } catch (err) {
      active.error = err instanceof Error ? err.message : String(err);
      throw err;
    }
  }

  if ("error" in runner) {
    active.error = runner.error;
    throw new Error(runner.error);
  }

  active.phase = "downloading_model";

  await new Promise<void>((resolve, reject) => {
    const proc = spawn(
      runner.command,
      [...runner.argsPrefix, "--model", model.hfId, "--download-model"],
      {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, PYTHONUNBUFFERED: "1" },
      },
    );
    active.proc = proc;

    proc.stderr?.on("data", (data: Buffer) => {
      active.stderr = `${active.stderr}${data.toString()}`.slice(-2_000);
    });

    proc.on("error", (err) => {
      active.error = `Failed to start MLX model download: ${err.message}`;
      reject(err);
    });

    proc.on("close", (code, signal) => {
      if (!activeDownloads.has(modelId)) {
        resolve();
        return;
      }

      if (signal) {
        activeDownloads.delete(modelId);
        resolve();
        return;
      }

      if (code === 0) {
        activeDownloads.delete(modelId);
        resolve();
        return;
      }

      active.error =
        active.stderr.trim() ||
        `MLX model download failed with exit code ${code ?? "unknown"}`;
      reject(new Error(active.error));
    });
  });
}

export function cancelMlxDownload(modelId: string): boolean {
  const active = activeDownloads.get(modelId);
  if (!active) return false;
  if (active.phase === "building_binary") {
    cancelMlxRuntimeDownload();
  }
  active.proc?.kill();
  activeDownloads.delete(modelId);
  return true;
}

export function deleteMlxModel(modelId: string): boolean {
  const model = getMlxAsrModel(modelId);
  if (!model) return false;

  cancelMlxDownload(modelId);
  stopMlxServer().catch(() => {});

  const dir = hfRepoCacheDir(model.hfId);
  const existed = existsSync(dir);
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    return false;
  }

  try {
    const db = getDb();
    const configuredId = `${MLX_ASR_PROVIDER_ID}/${modelId}`;
    db.prepare(
      "DELETE FROM model_configs WHERE type = 'voice' AND provider = ? AND model_id = ?",
    ).run(MLX_ASR_PROVIDER_ID, configuredId);
  } catch {
    // DB may be unavailable during shutdown
  }

  return existed;
}
