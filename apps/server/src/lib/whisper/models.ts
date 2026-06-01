import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
  getBinDir,
  getModelPath,
  getModelsDir,
  getWhisperModel,
  WHISPER_CPP_VERSION,
  WHISPER_MODELS,
  type WhisperModelDef,
} from "./constants.js";

export type DownloadStatus =
  | "not_downloaded"
  | "downloading"
  | "verifying"
  | "ready"
  | "error";

export type DownloadPhase = "building_binary" | "downloading_model";

export interface ModelDownloadState {
  model: string;
  fileName: string;
  sizeBytes: number;
  displayName: string;
  status: DownloadStatus;
  phase?: DownloadPhase;
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
  phase: DownloadPhase;
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

function baseModelState(
  modelId: string,
  model: WhisperModelDef,
): Pick<
  ModelDownloadState,
  "model" | "fileName" | "sizeBytes" | "displayName"
> {
  return {
    model: modelId,
    fileName: model.fileName,
    sizeBytes: model.sizeBytes,
    displayName: model.displayName,
  };
}

export function getModelStatus(modelId: string): ModelDownloadState | null {
  const model = getWhisperModel(modelId);
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
    return {
      ...baseModelState(modelId, model),
      status: "downloading",
      phase: active.phase,
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
    return { ...baseModelState(modelId, model), status: "ready" };
  }

  return { ...baseModelState(modelId, model), status: "not_downloaded" };
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

  const { isBinaryAvailable } = await import("./binary.js");
  const needsBinary = !isBinaryAvailable();

  const controller = new AbortController();
  const active: ActiveDownload = {
    controller,
    phase: needsBinary ? "building_binary" : "downloading_model",
    bytesDownloaded: 0,
    bytesTotal: needsBinary ? 0 : model.sizeBytes,
    speedBps: 0,
    startedAt: Date.now(),
    lastUpdate: Date.now(),
    lastBytes: 0,
  };
  activeDownloads.set(modelId, active);

  if (needsBinary) {
    try {
      await ensureBinariesDownloaded();
    } catch (err) {
      active.error = err instanceof Error ? err.message : String(err);
      throw err;
    }

    active.phase = "downloading_model";
    active.bytesTotal = model.sizeBytes;
    active.bytesDownloaded = 0;
    active.speedBps = 0;
    active.lastUpdate = Date.now();
    active.lastBytes = 0;
  }

  ensureModelsDir();

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
    await pipeline(webBodyToReadable(res.body, active), fileStream);

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
// Binary acquisition
// ---------------------------------------------------------------------------

let binaryDownloadPromise: Promise<void> | null = null;

export function isBinaryDownloading(): boolean {
  return binaryDownloadPromise !== null;
}

export async function ensureBinariesDownloaded(): Promise<void> {
  const { isBinaryAvailable } = await import("./binary.js");
  if (isBinaryAvailable()) return;

  if (binaryDownloadPromise) return binaryDownloadPromise;
  const task =
    process.platform === "win32"
      ? downloadWindowsBinaries()
      : buildFromSource();
  binaryDownloadPromise = task.finally(() => {
    binaryDownloadPromise = null;
  });
  return binaryDownloadPromise;
}

async function buildFromSource(): Promise<void> {
  const binDir = getBinDir();
  if (!existsSync(binDir)) mkdirSync(binDir, { recursive: true });

  const srcDir = join(binDir, "whisper.cpp-src");
  const buildDir = join(srcDir, "build");

  const tarballUrl = `https://github.com/ggml-org/whisper.cpp/archive/refs/tags/v${WHISPER_CPP_VERSION}.tar.gz`;
  const tarPath = join(binDir, `whisper-${WHISPER_CPP_VERSION}.tar.gz`);

  console.log("[whisper] Downloading whisper.cpp source...");

  const res = await fetch(tarballUrl, {
    redirect: "follow",
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok || !res.body) {
    throw new Error(
      `Failed to download whisper.cpp source: HTTP ${res.status}`,
    );
  }

  const fileStream = createWriteStream(tarPath);
  await pipeline(webBodyToReadable(res.body), fileStream);

  console.log("[whisper] Extracting source...");

  if (existsSync(srcDir)) {
    rmSync(srcDir, { recursive: true, force: true });
  }
  mkdirSync(srcDir, { recursive: true });

  try {
    execFileSync(
      "tar",
      ["xzf", tarPath, "-C", srcDir, "--strip-components=1"],
      { stdio: "pipe", timeout: 30_000 },
    );
  } catch {
    throw new Error(
      "Failed to extract whisper.cpp source. Ensure 'tar' is installed.",
    );
  }

  try {
    unlinkSync(tarPath);
  } catch {}

  console.log("[whisper] Building whisper.cpp (this may take a minute)...");

  try {
    mkdirSync(buildDir, { recursive: true });
    execFileSync(
      "cmake",
      ["..", "-DCMAKE_BUILD_TYPE=Release", "-DBUILD_SHARED_LIBS=OFF"],
      { cwd: buildDir, stdio: "pipe", timeout: 60_000 },
    );
    execFileSync("cmake", ["--build", ".", "--config", "Release", "-j"], {
      cwd: buildDir,
      stdio: "pipe",
      timeout: 300_000,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to build whisper.cpp. Ensure cmake and a C/C++ compiler are installed.\n${msg}`,
    );
  }

  const binaryName = "whisper-cli";
  const serverName = "whisper-server";

  for (const name of [binaryName, serverName]) {
    const builtPath = join(buildDir, "bin", name);
    if (existsSync(builtPath)) {
      copyFileSync(builtPath, join(binDir, name));
      chmodSync(join(binDir, name), 0o755);
    }
  }

  const libDirs = [join(buildDir, "src"), join(buildDir, "ggml", "src")];
  for (const libDir of libDirs) {
    if (!existsSync(libDir)) continue;
    for (const file of readdirSync(libDir)) {
      if (file.endsWith(".dylib") || /\.so(\.\d+)*$/.test(file)) {
        copyFileSync(join(libDir, file), join(binDir, file));
      }
    }
  }

  if (process.platform === "darwin") {
    for (const name of [binaryName, serverName]) {
      const binPath = join(binDir, name);
      if (!existsSync(binPath)) continue;
      try {
        execFileSync("install_name_tool", ["-add_rpath", binDir, binPath], {
          stdio: "pipe",
          timeout: 10_000,
        });
      } catch {}
    }
  }

  try {
    rmSync(srcDir, { recursive: true, force: true });
  } catch {}

  const { isBinaryAvailable } = await import("./binary.js");
  if (!isBinaryAvailable()) {
    throw new Error(
      "whisper.cpp build completed but binary not found. Check build output.",
    );
  }

  console.log("[whisper] Build complete");
}

async function downloadWindowsBinaries(): Promise<void> {
  const binDir = getBinDir();
  if (!existsSync(binDir)) mkdirSync(binDir, { recursive: true });

  const winVersion = "1.8.5";
  const archiveUrl = `https://github.com/ggml-org/whisper.cpp/releases/download/v${winVersion}/whisper-bin-x64.zip`;
  const tmpZip = join(binDir, "whisper-bin.zip");

  console.log("[whisper] Downloading pre-built Windows binaries...");

  const res = await fetch(archiveUrl, {
    redirect: "follow",
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download whisper binaries: HTTP ${res.status}`);
  }

  const fileStream = createWriteStream(tmpZip);
  await pipeline(webBodyToReadable(res.body), fileStream);

  try {
    execFileSync(
      "powershell",
      [
        "-Command",
        `Expand-Archive -Force -Path '${tmpZip}' -DestinationPath '${binDir}'`,
      ],
      { stdio: "pipe", timeout: 30_000 },
    );
  } catch {
    try {
      unlinkSync(tmpZip);
    } catch {}
    throw new Error("Failed to extract whisper binaries.");
  }

  try {
    unlinkSync(tmpZip);
  } catch {}

  // The upstream zip nests executables inside a Release/ subdirectory.
  // Move them up so they sit directly inside binDir where findExecutable looks.
  const releaseDir = join(binDir, "Release");
  if (existsSync(releaseDir)) {
    for (const name of readdirSync(releaseDir)) {
      renameSync(join(releaseDir, name), join(binDir, name));
    }
    rmSync(releaseDir, { recursive: true, force: true });
  }

  console.log("[whisper] Windows binaries downloaded");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function webBodyToReadable(
  body: ReadableStream<Uint8Array>,
  progress?: {
    bytesDownloaded: number;
    lastUpdate: number;
    lastBytes: number;
    speedBps: number;
  },
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
        if (progress) {
          progress.bytesDownloaded += value.byteLength;
          const now = Date.now();
          const elapsed = now - progress.lastUpdate;
          if (elapsed >= 500) {
            const bytesDelta = progress.bytesDownloaded - progress.lastBytes;
            progress.speedBps = Math.round((bytesDelta / elapsed) * 1000);
            progress.lastUpdate = now;
            progress.lastBytes = progress.bytesDownloaded;
          }
        }
        this.push(Buffer.from(value));
      } catch (err) {
        this.destroy(err instanceof Error ? err : new Error(String(err)));
      }
    },
  });
}
