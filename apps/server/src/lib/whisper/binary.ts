import { execFileSync } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { dirname, join } from "node:path";
import {
  getBinaryName,
  getBinDir,
  getResourcesDir,
  getServerBinaryName,
} from "./constants.js";

// On Windows, X_OK is not meaningful (no Unix-style execute permission bits).
// Use F_OK (existence check) instead so we don't miss valid binaries.
const EXEC_CHECK =
  process.platform === "win32" ? constants.F_OK : constants.X_OK;

function findInPath(name: string): string | null {
  try {
    const cmd = process.platform === "win32" ? "where" : "which";
    const result = execFileSync(cmd, [name], {
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 3000,
    });
    const path = result.toString().trim().split("\n")[0];
    if (path) return path;
  } catch {}
  return null;
}

function findExecutable(name: string | null): string | null {
  if (!name) return null;

  const localPath = join(getBinDir(), name);
  try {
    accessSync(localPath, EXEC_CHECK);
    return localPath;
  } catch {}

  const resourcesDir = getResourcesDir();
  const bundledPath = join(resourcesDir, name);
  try {
    accessSync(bundledPath, EXEC_CHECK);
    return bundledPath;
  } catch {}

  return findInPath(name);
}

// PATH lookups spawn `which`/`where` synchronously, so cache results.
// Reset via resetBinaryCache() after binaries are downloaded/built.
let cachedBinary: string | null | undefined;
let cachedServer: string | null | undefined;

export function resetBinaryCache(): void {
  cachedBinary = undefined;
  cachedServer = undefined;
}

export function findWhisperBinary(): string | null {
  if (cachedBinary === undefined) {
    // Homebrew installs as "whisper-cpp" not "whisper-cli"
    cachedBinary = findExecutable(getBinaryName()) ?? findInPath("whisper-cpp");
  }
  return cachedBinary;
}

export function findWhisperServer(): string | null {
  if (cachedServer === undefined) {
    cachedServer = findExecutable(getServerBinaryName());
  }
  return cachedServer;
}

export function isBinaryAvailable(): boolean {
  return findWhisperBinary() !== null;
}

export function isServerBinaryAvailable(): boolean {
  return findWhisperServer() !== null;
}

/**
 * Windows NTSTATUS code for STATUS_DLL_NOT_FOUND. When `whisper-cli.exe`
 * or `whisper-server.exe` exits with this code the Visual C++ Redistributable
 * (or a companion DLL like ggml.dll) is missing.
 */
export const WIN_DLL_NOT_FOUND_EXIT = 3221225781;

export const WIN_DLL_NOT_FOUND_MESSAGE =
  "a required system library is missing. " +
  "Please install the Visual C++ Redistributable from " +
  "https://aka.ms/vs/17/release/vc_redist.x64.exe";

/**
 * Return spawn options that set `cwd` to the binary's directory and prepend
 * it to `PATH` so companion DLLs (ggml.dll, whisper.dll) are found on Windows.
 */
export function whisperSpawnEnv(binaryPath: string): {
  cwd: string;
  env: NodeJS.ProcessEnv;
} {
  const binDir = dirname(binaryPath);
  return {
    cwd: binDir,
    env: {
      ...process.env,
      PATH: `${binDir}${process.platform === "win32" ? ";" : ":"}${process.env.PATH ?? ""}`,
    },
  };
}
