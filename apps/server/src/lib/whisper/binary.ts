import { execFileSync } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { join } from "node:path";
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

export function findWhisperBinary(): string | null {
  const primary = findExecutable(getBinaryName());
  if (primary) return primary;
  // Homebrew installs as "whisper-cpp" not "whisper-cli"
  return findInPath("whisper-cpp");
}

export function findWhisperServer(): string | null {
  return findExecutable(getServerBinaryName());
}

export function isBinaryAvailable(): boolean {
  return findWhisperBinary() !== null;
}

export function isServerBinaryAvailable(): boolean {
  return findWhisperServer() !== null;
}
