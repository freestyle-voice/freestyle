import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  getManagedMlxWorkerPath,
  getMlxRuntimeDir,
  isAppleSiliconMac,
} from "./constants.js";
import { getMlxAsrServerScriptPath } from "./python.js";

const MLX_WORKER_ASSET_NAME = "mlx_asr_worker-darwin-arm64.tar.gz";
const DEFAULT_MLX_WORKER_LATEST_URL = `https://github.com/freestyle-voice/freestyle/releases/latest/download/${MLX_WORKER_ASSET_NAME}`;
// Keep this in sync with scripts/build_mlx_asr_worker.sh so unchanged worker
// builds don't force users to redownload identical archives on every app release.
const MLX_WORKER_BUILD_SPEC =
  "pyinstaller=6.20.0;mlx-audio=0.4.3;huggingface_hub=1.17.0;bundle=onedir";

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

interface InstalledMlxRuntimeMetadata {
  downloadedAt: string;
  sourceUrl: string;
  workerVersion: string | null;
}

let activeDownload: ActiveRuntimeDownload | null = null;
let cachedExpectedVersion: string | null | undefined;

function expectedRuntimeVersion(): string | null {
  return (
    process.env.FREESTYLE_MLX_ASR_WORKER_VERSION || deriveBundledWorkerVersion()
  );
}

function deriveBundledWorkerVersion(): string | null {
  if (cachedExpectedVersion !== undefined) {
    return cachedExpectedVersion;
  }

  try {
    const scriptPath = getMlxAsrServerScriptPath();
    if (!scriptPath || !existsSync(scriptPath)) {
      cachedExpectedVersion = null;
      return null;
    }

    const script = readFileSync(scriptPath);
    cachedExpectedVersion = createHash("sha256")
      .update(MLX_WORKER_BUILD_SPEC)
      .update("\0")
      .update(script)
      .digest("hex")
      .slice(0, 16);
    return cachedExpectedVersion;
  } catch {
    cachedExpectedVersion = null;
    return null;
  }
}

function runtimeReleaseTag(): string | null {
  return (
    process.env.FREESTYLE_MLX_ASR_RELEASE_TAG ||
    process.env.FREESTYLE_MLX_ASR_WORKER_VERSION ||
    null
  );
}

function runtimeUrl(): string | null {
  const envUrl = process.env.FREESTYLE_MLX_ASR_WORKER_URL;
  if (envUrl) return envUrl;

  const releaseTag = runtimeReleaseTag();
  if (releaseTag) {
    return `https://github.com/freestyle-voice/freestyle/releases/download/${releaseTag}/${MLX_WORKER_ASSET_NAME}`;
  }

  return DEFAULT_MLX_WORKER_LATEST_URL;
}

function runtimeMetadataPath(rootDir = getMlxRuntimeDir()): string {
  return join(rootDir, "metadata.json");
}

function readInstalledRuntimeMetadata(): InstalledMlxRuntimeMetadata | null {
  try {
    const raw = readFileSync(runtimeMetadataPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<InstalledMlxRuntimeMetadata>;
    return {
      downloadedAt:
        typeof parsed.downloadedAt === "string" ? parsed.downloadedAt : "",
      sourceUrl: typeof parsed.sourceUrl === "string" ? parsed.sourceUrl : "",
      workerVersion:
        typeof parsed.workerVersion === "string" ? parsed.workerVersion : null,
    };
  } catch {
    return null;
  }
}

function writeRuntimeMetadata(rootDir: string, sourceUrl: string): void {
  const metadata: InstalledMlxRuntimeMetadata = {
    downloadedAt: new Date().toISOString(),
    sourceUrl,
    workerVersion: expectedRuntimeVersion(),
  };
  writeFileSync(
    runtimeMetadataPath(rootDir),
    JSON.stringify(metadata, null, 2),
    "utf8",
  );
}

export function isMlxRuntimeInstallable(): boolean {
  return isAppleSiliconMac() && !!runtimeUrl();
}

export function isManagedMlxRuntimeAvailable(): boolean {
  return existsSync(getManagedMlxWorkerPath());
}

export function getInstalledMlxRuntimeVersion(): string | null {
  return readInstalledRuntimeMetadata()?.workerVersion ?? null;
}

export function needsManagedMlxRuntimeUpdate(): boolean {
  const version = expectedRuntimeVersion();
  if (!version || !isManagedMlxRuntimeAvailable()) return false;
  return getInstalledMlxRuntimeVersion() !== version;
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
  if (isManagedMlxRuntimeAvailable() && !needsManagedMlxRuntimeUpdate()) return;
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

export async function updateManagedMlxRuntimeIfNeeded(): Promise<boolean> {
  if (!needsManagedMlxRuntimeUpdate()) return false;
  await ensureMlxRuntimeDownloaded();
  return true;
}

export function cancelMlxRuntimeDownload(): boolean {
  if (!activeDownload) return false;
  activeDownload.controller.abort();
  activeDownload = null;
  return true;
}

function runtimeDownloadHttpError(url: string, status: number): Error {
  if (
    status === 404 &&
    url.includes("github.com/freestyle-voice/freestyle/releases/download/")
  ) {
    return new Error(
      "MLX runtime download failed because this Freestyle release does not include the MLX worker asset yet.",
    );
  }

  if (
    status === 404 &&
    url.includes(
      "github.com/freestyle-voice/freestyle/releases/latest/download/",
    )
  ) {
    return new Error(
      "MLX runtime download failed because no published Freestyle release contains the MLX worker asset yet.",
    );
  }

  if (status === 403 && url.includes("github.com/freestyle-voice/freestyle")) {
    return new Error(
      "MLX runtime download failed because GitHub temporarily rejected the request (HTTP 403). Please try again in a few minutes.",
    );
  }

  return new Error(`MLX runtime download failed: HTTP ${status}`);
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
      throw runtimeDownloadHttpError(url, res.status);
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
    writeRuntimeMetadata(tempDir, url);

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
