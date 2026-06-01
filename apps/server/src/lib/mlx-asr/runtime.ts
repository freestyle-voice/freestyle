import { execFileSync } from "node:child_process";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  unlinkSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  getManagedMlxWorkerPath,
  getMlxRuntimeDir,
  isAppleSiliconMac,
} from "./constants.js";

const MLX_WORKER_RELEASE = "mlx-asr-worker-v1";
const DEFAULT_MLX_WORKER_URL = `https://github.com/freestyle-voice/freestyle/releases/download/${MLX_WORKER_RELEASE}/mlx_asr_worker-darwin-arm64.tar.gz`;

export interface MlxRuntimeDownloadStatus {
  available: boolean;
  downloading: boolean;
  url: string | null;
  downloadProgress?: {
    bytesDownloaded: number;
    bytesTotal: number;
    percent: number;
    speedBps: number;
  };
  error?: string;
}

interface ActiveRuntimeDownload {
  controller: AbortController;
  bytesDownloaded: number;
  bytesTotal: number;
  speedBps: number;
  lastUpdate: number;
  lastBytes: number;
  error?: string;
  promise: Promise<void>;
}

let activeDownload: ActiveRuntimeDownload | null = null;

function runtimeUrl(): string | null {
  return process.env.FREESTYLE_MLX_ASR_WORKER_URL || DEFAULT_MLX_WORKER_URL;
}

export function isMlxRuntimeInstallable(): boolean {
  return isAppleSiliconMac() && !!runtimeUrl();
}

export function isManagedMlxRuntimeAvailable(): boolean {
  return existsSync(getManagedMlxWorkerPath());
}

export function getMlxRuntimeDownloadStatus(): MlxRuntimeDownloadStatus {
  const available = isManagedMlxRuntimeAvailable();
  if (activeDownload?.error) {
    return {
      available,
      downloading: false,
      url: runtimeUrl(),
      error: activeDownload.error,
    };
  }
  if (activeDownload) {
    return {
      available,
      downloading: true,
      url: runtimeUrl(),
      downloadProgress: activeDownload.bytesTotal
        ? {
            bytesDownloaded: activeDownload.bytesDownloaded,
            bytesTotal: activeDownload.bytesTotal,
            percent: Math.round(
              (activeDownload.bytesDownloaded / activeDownload.bytesTotal) *
                100,
            ),
            speedBps: activeDownload.speedBps,
          }
        : undefined,
    };
  }
  return { available, downloading: false, url: runtimeUrl() };
}

export async function ensureMlxRuntimeDownloaded(): Promise<void> {
  if (isManagedMlxRuntimeAvailable()) return;
  if (!isMlxRuntimeInstallable()) {
    throw new Error("MLX ASR runtime is only available on Apple Silicon Macs.");
  }
  if (activeDownload && !activeDownload.error) return activeDownload.promise;
  if (activeDownload?.error) activeDownload = null;

  const controller = new AbortController();
  const active: ActiveRuntimeDownload = {
    controller,
    bytesDownloaded: 0,
    bytesTotal: 0,
    speedBps: 0,
    lastUpdate: Date.now(),
    lastBytes: 0,
    promise: Promise.resolve(),
  };

  active.promise = downloadRuntime(active).finally(() => {
    if (activeDownload === active && !active.error) {
      activeDownload = null;
    }
  });
  activeDownload = active;
  return active.promise;
}

export function cancelMlxRuntimeDownload(): boolean {
  if (!activeDownload) return false;
  activeDownload.controller.abort();
  activeDownload = null;
  return true;
}

async function downloadRuntime(active: ActiveRuntimeDownload): Promise<void> {
  const url = runtimeUrl();
  if (!url) throw new Error("MLX ASR worker download URL is not configured.");

  const runtimeDir = getMlxRuntimeDir();
  const tempDir = `${runtimeDir}.downloading`;
  const archivePath = join(tempDir, "mlx_asr_worker.tar.gz");

  rmSync(tempDir, { recursive: true, force: true });
  mkdirSync(tempDir, { recursive: true });

  try {
    const res = await fetch(url, {
      signal: active.controller.signal,
      redirect: "follow",
    });
    if (!res.ok || !res.body) {
      throw new Error(`MLX runtime download failed: HTTP ${res.status}`);
    }

    const contentLength = res.headers.get("content-length");
    if (contentLength) active.bytesTotal = Number.parseInt(contentLength, 10);

    await pipeline(
      webBodyToReadable(res.body, active),
      createWriteStream(archivePath),
    );

    execFileSync("tar", ["xzf", archivePath, "-C", tempDir], {
      stdio: "pipe",
      timeout: 120_000,
    });
    unlinkSync(archivePath);

    rmSync(runtimeDir, { recursive: true, force: true });
    mkdirSync(dirname(runtimeDir), { recursive: true });
    renameSync(tempDir, runtimeDir);

    if (!isManagedMlxRuntimeAvailable()) {
      throw new Error(
        "MLX runtime downloaded but worker executable is missing.",
      );
    }
  } catch (err) {
    rmSync(tempDir, { recursive: true, force: true });
    if (active.controller.signal.aborted) return;
    active.error = err instanceof Error ? err.message : String(err);
    throw err;
  }
}

function webBodyToReadable(
  body: ReadableStream<Uint8Array>,
  progress: ActiveRuntimeDownload,
): Readable {
  const reader = body.getReader();
  return new Readable({
    async read() {
      try {
        const { done, value } = await reader.read();
        if (done) {
          this.push(null);
          return;
        }
        progress.bytesDownloaded += value.byteLength;
        const now = Date.now();
        const elapsed = now - progress.lastUpdate;
        if (elapsed >= 500) {
          const delta = progress.bytesDownloaded - progress.lastBytes;
          progress.speedBps = Math.round((delta / elapsed) * 1000);
          progress.lastUpdate = now;
          progress.lastBytes = progress.bytesDownloaded;
        }
        this.push(Buffer.from(value));
      } catch (err) {
        this.destroy(err instanceof Error ? err : new Error(String(err)));
      }
    },
  });
}
