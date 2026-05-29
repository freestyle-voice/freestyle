import { accessSync, constants } from "node:fs";
import { join } from "node:path";
import {
  getBinaryName,
  getBinDir,
  getResourcesDir,
  getServerBinaryName,
} from "./constants.js";

function findExecutable(name: string | null): string | null {
  if (!name) return null;

  // Check user-local download dir first (~/.cache/freestyle/whisper-bin/)
  const localPath = join(getBinDir(), name);
  try {
    accessSync(localPath, constants.X_OK);
    return localPath;
  } catch {}

  // Then check bundled resources dir
  const resourcesDir = getResourcesDir();
  const bundledPath = join(resourcesDir, name);
  try {
    accessSync(bundledPath, constants.X_OK);
    return bundledPath;
  } catch {}

  return null;
}

export function findWhisperBinary(): string | null {
  return findExecutable(getBinaryName());
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
