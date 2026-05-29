import { execFileSync } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { join } from "node:path";
import {
  getBinaryName,
  getBinDir,
  getResourcesDir,
  getServerBinaryName,
} from "./constants.js";

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
    accessSync(localPath, constants.X_OK);
    return localPath;
  } catch {}

  const resourcesDir = getResourcesDir();
  const bundledPath = join(resourcesDir, name);
  try {
    accessSync(bundledPath, constants.X_OK);
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
