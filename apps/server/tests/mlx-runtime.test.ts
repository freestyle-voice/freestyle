import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ORIGINAL_ENV = { ...process.env };

let homeDir = "";
const TEST_DIR = fileURLToPath(new URL(".", import.meta.url));

function restoreEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }
  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function runtimeRoot(): string {
  return join(
    homeDir,
    ".cache",
    "freestyle",
    "mlx-asr",
    "runtime",
    `${process.platform}-${process.arch}`,
  );
}

function writeManagedRuntime(version?: string | null): void {
  const root = runtimeRoot();
  const workerDir = join(root, "mlx_asr_worker");
  mkdirSync(workerDir, { recursive: true });
  writeFileSync(join(workerDir, "mlx_asr_worker"), "worker");

  if (version !== undefined) {
    writeFileSync(
      join(root, "metadata.json"),
      JSON.stringify(
        {
          downloadedAt: "2026-06-03T00:00:00.000Z",
          sourceUrl: "https://example.com/mlx_asr_worker-darwin-arm64.tar.gz",
          workerVersion: version,
        },
        null,
        2,
      ),
      "utf8",
    );
  }
}

function deriveBundledVersion(): string {
  const script = readFileSync(
    join(TEST_DIR, "..", "..", "..", "scripts", "mlx_asr_server.py"),
    "utf8",
  );
  return createHash("sha256")
    .update(
      "pyinstaller=6.20.0;mlx-audio=0.4.3;huggingface_hub=1.17.0;bundle=onedir",
    )
    .update("\0")
    .update(script)
    .digest("hex")
    .slice(0, 16);
}

async function importRuntime() {
  vi.doMock("../src/lib/mlx-asr/constants.js", async () => {
    const actual = await vi.importActual<
      typeof import("../src/lib/mlx-asr/constants.js")
    >("../src/lib/mlx-asr/constants.js");
    return {
      ...actual,
      isAppleSiliconMac: () => true,
    };
  });

  return import("../src/lib/mlx-asr/runtime.js");
}

beforeEach(() => {
  homeDir = mkdtempSync(join(tmpdir(), "freestyle-mlx-runtime-"));
  process.env.HOME = homeDir;
  delete process.env.FREESTYLE_MLX_ASR_RELEASE_TAG;
  delete process.env.FREESTYLE_MLX_ASR_WORKER_URL;
  delete process.env.FREESTYLE_MLX_ASR_WORKER_VERSION;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.doUnmock("../src/lib/mlx-asr/constants.js");
  restoreEnv();
  if (homeDir) {
    rmSync(homeDir, { recursive: true, force: true });
  }
});

describe("MLX runtime versioning", () => {
  it("derives the runtime download URL from the current app release version", async () => {
    process.env.FREESTYLE_MLX_ASR_RELEASE_TAG = "0.9.0";

    const runtime = await importRuntime();

    expect(runtime.getMlxRuntimeDownloadStatus().url).toBe(
      "https://github.com/freestyle-voice/freestyle/releases/download/0.9.0/mlx_asr_worker-darwin-arm64.tar.gz",
    );
  });

  it("skips re-downloading when the installed worker already matches the app release", async () => {
    process.env.FREESTYLE_MLX_ASR_WORKER_VERSION = "0.9.0";
    writeManagedRuntime("0.9.0");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const runtime = await importRuntime();

    expect(runtime.needsManagedMlxRuntimeUpdate()).toBe(false);
    await expect(runtime.ensureMlxRuntimeDownloaded()).resolves.toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("refreshes the managed worker when the app release version changes", async () => {
    process.env.FREESTYLE_MLX_ASR_WORKER_VERSION = "0.9.1";
    writeManagedRuntime("0.9.0");
    const fetchSpy = vi
      .fn()
      .mockRejectedValue(new Error("runtime download failed"));
    vi.stubGlobal("fetch", fetchSpy);

    const runtime = await importRuntime();

    expect(runtime.needsManagedMlxRuntimeUpdate()).toBe(true);
    await expect(runtime.ensureMlxRuntimeDownloaded()).rejects.toThrow(
      "runtime download failed",
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://github.com/freestyle-voice/freestyle/releases/download/0.9.1/mlx_asr_worker-darwin-arm64.tar.gz",
      expect.objectContaining({ redirect: "follow" }),
    );
  });

  it("does not attempt a managed-runtime update until a worker has been installed once", async () => {
    process.env.FREESTYLE_MLX_ASR_WORKER_VERSION = "0.9.1";

    const runtime = await importRuntime();

    expect(runtime.needsManagedMlxRuntimeUpdate()).toBe(false);
    await expect(runtime.updateManagedMlxRuntimeIfNeeded()).resolves.toBe(
      false,
    );
  });

  it("does not re-download the managed runtime when the app release changes but the worker build is unchanged", async () => {
    process.env.FREESTYLE_MLX_ASR_RELEASE_TAG = "0.9.2";
    writeManagedRuntime(deriveBundledVersion());
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const runtime = await importRuntime();

    expect(runtime.needsManagedMlxRuntimeUpdate()).toBe(false);
    await expect(runtime.updateManagedMlxRuntimeIfNeeded()).resolves.toBe(
      false,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns a helpful error when the app release is missing the worker asset", async () => {
    process.env.FREESTYLE_MLX_ASR_RELEASE_TAG = "0.9.1";
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      body: null,
    });
    vi.stubGlobal("fetch", fetchSpy);

    const runtime = await importRuntime();

    await expect(runtime.ensureMlxRuntimeDownloaded()).rejects.toThrow(
      "this Freestyle release does not include the MLX worker asset yet",
    );
  });
});
