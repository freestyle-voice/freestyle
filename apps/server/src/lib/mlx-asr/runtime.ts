import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  getManagedMlxWorkerPath,
  getMlxCacheDir,
  getMlxRuntimeDir,
  isAppleSiliconMac,
  MLX_ASR_MODELS,
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
  /** App semver this worker install was synced for (post-update activation). */
  syncedAppVersion: string | null;
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

function runtimeUrlForReleaseTag(releaseTag: string): string {
  return `https://github.com/freestyle-voice/freestyle/releases/download/${releaseTag}/${MLX_WORKER_ASSET_NAME}`;
}

function runtimeUrl(): string | null {
  const envUrl = process.env.FREESTYLE_MLX_ASR_WORKER_URL;
  if (envUrl) return envUrl;

  const releaseTag = runtimeReleaseTag();
  if (releaseTag) {
    return runtimeUrlForReleaseTag(releaseTag);
  }

  return DEFAULT_MLX_WORKER_LATEST_URL;
}

function getMlxRuntimeStagingRoot(): string {
  return join(
    getMlxCacheDir(),
    "staging",
    `${process.platform}-${process.arch}`,
  );
}

function stagedRuntimeRoot(releaseTag: string): string {
  return join(getMlxRuntimeStagingRoot(), releaseTag);
}

function stagedWorkerPath(releaseTag: string): string {
  return join(
    stagedRuntimeRoot(releaseTag),
    "mlx_asr_worker",
    "mlx_asr_worker",
  );
}

function isStagedRuntimeReady(releaseTag: string): boolean {
  return existsSync(stagedWorkerPath(releaseTag));
}

function hfRepoCacheDir(hfId: string): string {
  return join(
    process.env.HUGGINGFACE_HUB_CACHE ??
      (process.env.HF_HOME
        ? join(process.env.HF_HOME, "hub")
        : join(homedir(), ".cache", "huggingface", "hub")),
    `models--${hfId.replaceAll("/", "--")}`,
  );
}

function hasSnapshotFiles(snapshotDir: string): boolean {
  try {
    return readdirSync(snapshotDir).length > 0;
  } catch {
    return false;
  }
}

function hasAnyMlxModelDownloaded(): boolean {
  return MLX_ASR_MODELS.some((model) => {
    const snapshotsDir = join(hfRepoCacheDir(model.hfId), "snapshots");
    if (!existsSync(snapshotsDir)) return false;
    try {
      return readdirSync(snapshotsDir, { withFileTypes: true }).some(
        (entry) =>
          entry.isDirectory() &&
          hasSnapshotFiles(join(snapshotsDir, entry.name)),
      );
    } catch {
      return false;
    }
  });
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
      syncedAppVersion:
        typeof parsed.syncedAppVersion === "string"
          ? parsed.syncedAppVersion
          : null,
    };
  } catch {
    return null;
  }
}

function writeRuntimeMetadata(
  rootDir: string,
  sourceUrl: string,
  syncedAppVersion: string | null,
): void {
  const metadata: InstalledMlxRuntimeMetadata = {
    downloadedAt: new Date().toISOString(),
    sourceUrl,
    workerVersion: expectedRuntimeVersion(),
    syncedAppVersion,
  };
  writeFileSync(
    runtimeMetadataPath(rootDir),
    JSON.stringify(metadata, null, 2),
    "utf8",
  );
}

function isRuntimeSyncedForAppVersion(appVersion: string): boolean {
  const meta = readInstalledRuntimeMetadata();
  if (meta?.syncedAppVersion !== appVersion) return false;
  if (!isManagedMlxRuntimeAvailable()) return false;
  return !needsManagedMlxRuntimeUpdate();
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

/** Stage the worker for an upcoming app release without replacing the active runtime. */
export async function prefetchManagedMlxRuntimeForAppRelease(
  releaseTag: string,
): Promise<boolean> {
  if (!isAppleSiliconMac() || !hasAnyMlxModelDownloaded()) return false;
  if (isStagedRuntimeReady(releaseTag)) return false;
  if (!isMlxRuntimeInstallable()) return false;
  if (activeDownload && !activeDownload.error) return false;

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

  active.promise = downloadRuntimeToDir(
    active,
    stagedRuntimeRoot(releaseTag),
    runtimeUrlForReleaseTag(releaseTag),
  ).finally(() => {
    if (activeDownload === active && !active.error) {
      activeDownload = null;
    }
  });
  activeDownload = active;
  await active.promise;
  return isStagedRuntimeReady(releaseTag);
}

function promoteStagedRuntime(releaseTag: string): boolean {
  if (!isStagedRuntimeReady(releaseTag)) return false;

  const runtimeDir = getMlxRuntimeDir();
  const stagedRoot = stagedRuntimeRoot(releaseTag);
  const sourceUrl = runtimeUrlForReleaseTag(releaseTag);

  rmSync(runtimeDir, { recursive: true, force: true });
  mkdirSync(dirname(runtimeDir), { recursive: true });
  renameSync(stagedRoot, runtimeDir);
  writeRuntimeMetadata(runtimeDir, sourceUrl, releaseTag);

  rmSync(getMlxRuntimeStagingRoot(), { recursive: true, force: true });

  return isManagedMlxRuntimeAvailable();
}

/**
 * After an app restart on a new version, promote a worker staged during app update.
 * Does not download on its own — lazy MLX paths fetch the worker on first use if
 * staging was skipped. No-ops unless the user has downloaded at least one MLX model.
 */
export async function activateManagedMlxRuntimeForAppVersion(
  appVersion: string,
): Promise<boolean> {
  if (!isAppleSiliconMac() || !hasAnyMlxModelDownloaded()) return false;
  if (isRuntimeSyncedForAppVersion(appVersion)) return false;
  if (!promoteStagedRuntime(appVersion)) return false;
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
  const releaseTag = runtimeReleaseTag();
  const tempDir = `${runtimeDir}.downloading`;
  await downloadRuntimeToDir(active, tempDir, url);

  rmSync(runtimeDir, { recursive: true, force: true });
  mkdirSync(dirname(runtimeDir), { recursive: true });
  renameSync(tempDir, runtimeDir);
  const syncedVersion =
    releaseTag ?? readInstalledRuntimeMetadata()?.syncedAppVersion ?? null;
  writeRuntimeMetadata(runtimeDir, url, syncedVersion);

  if (!isManagedMlxRuntimeAvailable()) {
    throw new Error("MLX runtime downloaded but worker executable is missing.");
  }
}

/** Record that the active worker matches this app version (after promote or lazy install). */
export function markManagedMlxRuntimeSyncedForAppVersion(
  appVersion: string,
): void {
  if (!isManagedMlxRuntimeAvailable()) return;
  const existing = readInstalledRuntimeMetadata();
  writeRuntimeMetadata(
    getMlxRuntimeDir(),
    existing?.sourceUrl ?? runtimeUrl() ?? "",
    appVersion,
  );
}

async function downloadRuntimeToDir(
  active: ActiveRuntimeDownload,
  destDir: string,
  url: string,
): Promise<void> {
  const archivePath = join(destDir, "mlx_asr_worker.tar.gz");

  rmSync(destDir, { recursive: true, force: true });
  mkdirSync(destDir, { recursive: true });

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

    execFileSync("tar", ["xzf", archivePath, "-C", destDir], {
      stdio: "pipe",
      timeout: 120_000,
    });
    unlinkSync(archivePath);
  } catch (err) {
    rmSync(destDir, { recursive: true, force: true });
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
