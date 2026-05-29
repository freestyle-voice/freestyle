import { Buffer } from "node:buffer";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  getBinaryRelease,
  getBinDir,
  getModelPath,
  getModelsDir,
  getWhisperModel,
  WHISPER_MODELS,
  type WhisperModelDef,
} from "./constants.js";

export type DownloadStatus =
  | "not_downloaded"
  | "downloading"
  | "verifying"
  | "ready"
  | "error";

export interface ModelDownloadState {
  model: string;
  fileName: string;
  sizeBytes: number;
  displayName: string;
  status: DownloadStatus;
  downloadProgress?: {
    bytesDownloaded: number;
    bytesTotal: number;
    percent: number;
    speedBps: number;
  };
  error?: string;
}

interface ActiveDownload {
  controller: AbortController;
  bytesDownloaded: number;
  bytesTotal: number;
  speedBps: number;
  startedAt: number;
  lastUpdate: number;
  lastBytes: number;
  error?: string;
}

const activeDownloads = new Map<string, ActiveDownload>();

function ensureModelsDir(): void {
  const dir = getModelsDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function isModelDownloaded(model: WhisperModelDef): boolean {
  const path = getModelPath(model);
  if (!existsSync(path)) return false;
  const stat = statSync(path);
  return stat.size >= model.sizeBytes * 0.95;
}

export function getModelStatus(modelId: string): ModelDownloadState | null {
  const model = getWhisperModel(modelId);
  if (!model) return null;

  const active = activeDownloads.get(modelId);

  if (active?.error) {
    return {
      model: modelId,
      fileName: model.fileName,
      sizeBytes: model.sizeBytes,
      displayName: model.displayName,
      status: "error",
      error: active.error,
    };
  }

  if (active) {
    return {
      model: modelId,
      fileName: model.fileName,
      sizeBytes: model.sizeBytes,
      displayName: model.displayName,
      status: "downloading",
      downloadProgress: {
        bytesDownloaded: active.bytesDownloaded,
        bytesTotal: active.bytesTotal,
        percent:
          active.bytesTotal > 0
            ? Math.round((active.bytesDownloaded / active.bytesTotal) * 100)
            : 0,
        speedBps: active.speedBps,
      },
    };
  }

  if (isModelDownloaded(model)) {
    return {
      model: modelId,
      fileName: model.fileName,
      sizeBytes: model.sizeBytes,
      displayName: model.displayName,
      status: "ready",
    };
  }

  return {
    model: modelId,
    fileName: model.fileName,
    sizeBytes: model.sizeBytes,
    displayName: model.displayName,
    status: "not_downloaded",
  };
}

export function getAllModelStatuses(): ModelDownloadState[] {
  return WHISPER_MODELS.map((m) => getModelStatus(m.id)!);
}

export async function downloadModel(modelId: string): Promise<void> {
  const model = getWhisperModel(modelId);
  if (!model) throw new Error(`Unknown whisper model: ${modelId}`);

  const existing = activeDownloads.get(modelId);
  if (existing && !existing.error) {
    throw new Error(`Model ${modelId} is already downloading`);
  }
  if (existing?.error) {
    activeDownloads.delete(modelId);
  }

  if (isModelDownloaded(model)) return;

  await ensureBinariesDownloaded();

  ensureModelsDir();

  const controller = new AbortController();
  const active: ActiveDownload = {
    controller,
    bytesDownloaded: 0,
    bytesTotal: model.sizeBytes,
    speedBps: 0,
    startedAt: Date.now(),
    lastUpdate: Date.now(),
    lastBytes: 0,
  };
  activeDownloads.set(modelId, active);

  const destPath = getModelPath(model);
  const tempPath = `${destPath}.downloading`;

  try {
    const res = await fetch(model.url, {
      signal: controller.signal,
      redirect: "follow",
    });

    if (!res.ok) {
      throw new Error(`Download failed: HTTP ${res.status} ${res.statusText}`);
    }

    const contentLength = res.headers.get("content-length");
    if (contentLength) {
      active.bytesTotal = Number.parseInt(contentLength, 10);
    }

    if (!res.body) {
      throw new Error("No response body received");
    }

    const fileStream = createWriteStream(tempPath);
    const reader = res.body.getReader();

    const nodeStream = new Readable({
      async read() {
        try {
          const { done, value } = await reader.read();
          if (done) {
            this.push(null);
            return;
          }
          active.bytesDownloaded += value.byteLength;

          const now = Date.now();
          const elapsed = now - active.lastUpdate;
          if (elapsed >= 500) {
            const bytesDelta = active.bytesDownloaded - active.lastBytes;
            active.speedBps = Math.round((bytesDelta / elapsed) * 1000);
            active.lastUpdate = now;
            active.lastBytes = active.bytesDownloaded;
          }

          this.push(Buffer.from(value));
        } catch (err) {
          this.destroy(err instanceof Error ? err : new Error(String(err)));
        }
      },
    });

    await pipeline(nodeStream, fileStream);

    renameSync(tempPath, destPath);
    activeDownloads.delete(modelId);
  } catch (err) {
    try {
      if (existsSync(tempPath)) unlinkSync(tempPath);
    } catch {}

    if (controller.signal.aborted) {
      activeDownloads.delete(modelId);
      return;
    }

    active.error = err instanceof Error ? err.message : String(err);
    throw err;
  }
}

export function cancelDownload(modelId: string): boolean {
  const active = activeDownloads.get(modelId);
  if (!active) return false;
  active.controller.abort();
  activeDownloads.delete(modelId);
  return true;
}

export function deleteModel(modelId: string): boolean {
  const model = getWhisperModel(modelId);
  if (!model) return false;

  cancelDownload(modelId);

  const path = getModelPath(model);
  try {
    if (existsSync(path)) {
      unlinkSync(path);
      return true;
    }
  } catch {}
  return false;
}

export function clearDownloadError(modelId: string): void {
  const active = activeDownloads.get(modelId);
  if (active?.error) {
    activeDownloads.delete(modelId);
  }
}

export function getDownloadedModelPath(modelId: string): string | null {
  const model = getWhisperModel(modelId);
  if (!model) return null;
  if (!isModelDownloaded(model)) return null;
  return getModelPath(model);
}

// ---------------------------------------------------------------------------
// Binary download
// ---------------------------------------------------------------------------

let binaryDownloadPromise: Promise<void> | null = null;

export async function ensureBinariesDownloaded(): Promise<void> {
  const { isBinaryAvailable } = await import("./binary.js");
  if (isBinaryAvailable()) return;

  if (binaryDownloadPromise) return binaryDownloadPromise;
  binaryDownloadPromise = downloadBinaries().finally(() => {
    binaryDownloadPromise = null;
  });
  return binaryDownloadPromise;
}

async function downloadBinaries(): Promise<void> {
  const release = getBinaryRelease();
  if (!release) {
    throw new Error(
      `No whisper.cpp binary available for ${process.platform}-${process.arch}`,
    );
  }

  const binDir = getBinDir();
  if (!existsSync(binDir)) mkdirSync(binDir, { recursive: true });

  const archiveUrl = release.archive;
  const tmpZip = join(binDir, "whisper-download.zip");

  console.log("[whisper] Downloading binaries from", archiveUrl);

  const res = await fetch(archiveUrl, {
    redirect: "follow",
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download whisper binaries: HTTP ${res.status}`);
  }

  const fileStream = createWriteStream(tmpZip);
  const reader = res.body.getReader();
  const nodeStream = new Readable({
    async read() {
      try {
        const { done, value } = await reader.read();
        if (done) {
          this.push(null);
          return;
        }
        this.push(Buffer.from(value));
      } catch (err) {
        this.destroy(err instanceof Error ? err : new Error(String(err)));
      }
    },
  });
  await pipeline(nodeStream, fileStream);

  console.log("[whisper] Extracting binaries to", binDir);

  const { execFileSync } = await import("node:child_process");
  try {
    execFileSync("unzip", ["-o", "-j", tmpZip, "-d", binDir], {
      stdio: "pipe",
    });
  } catch {
    try {
      unlinkSync(tmpZip);
    } catch {}
    throw new Error(
      "Failed to extract whisper binaries. Ensure 'unzip' is installed.",
    );
  }

  try {
    unlinkSync(tmpZip);
  } catch {}

  if (process.platform !== "win32") {
    const { chmodSync } = await import("node:fs");
    for (const bin of release.binaries) {
      const binPath = join(binDir, bin);
      if (existsSync(binPath)) {
        chmodSync(binPath, 0o755);
      }
    }
  }

  console.log("[whisper] Binaries downloaded successfully");
}
