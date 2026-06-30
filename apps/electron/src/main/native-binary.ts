/**
 * Resolves paths to native platform binaries.
 *
 * In development: apps/electron/resources/bin/<platform>-<arch>/<name>
 * In production:  process.resourcesPath + /bin/<name>
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";

const isDev = !app?.isPackaged;

const platform = process.platform;
const arch = process.arch;

const devBinDir = join(__dirname, "../../resources/bin", `${platform}-${arch}`);
const prodBinDir = join(process.resourcesPath ?? "", "bin");

/**
 * Get the absolute path to a native binary by name.
 * On Windows, appends .exe if not already present.
 * Returns null if the binary doesn't exist.
 */
export function getNativeBinaryPath(name: string): string | null {
  const exeName =
    platform === "win32" && !name.endsWith(".exe") ? `${name}.exe` : name;

  const devPath = join(devBinDir, exeName);
  if (isDev && existsSync(devPath)) return devPath;

  const prodPath = join(prodBinDir, exeName);
  if (existsSync(prodPath)) return prodPath;

  // Fallback: check dev path even in production (for build:unpack / directory builds)
  if (existsSync(devPath)) return devPath;

  return null;
}

/**
 * Check if a native binary is available.
 */
export function hasNativeBinary(name: string): boolean {
  return getNativeBinaryPath(name) !== null;
}
