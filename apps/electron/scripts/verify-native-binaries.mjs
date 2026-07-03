#!/usr/bin/env node

/**
 * Verifies that every native binary the app depends on was compiled AND
 * made it into the packaged build. Run after `electron-builder` in CI.
 *
 * Without this check, a toolchain failure on a CI runner ships an
 * installer whose hotkey/paste/mic features silently degrade to legacy
 * fallbacks (see specs/app-stability-audit.md §3.6).
 *
 * Checks two locations:
 *  1. Source:   resources/bin/<platform>-<arch>/          (compile:native output)
 *  2. Packaged: dist/<unpacked>/.../Resources|resources/bin/  (electron-builder extraResources)
 *
 * Pass --source-only to skip the packaged check (e.g. before packaging).
 */

import { readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const platform = process.platform;
const arch = process.arch;
const sourceOnly = process.argv.includes("--source-only");

// Keep in sync with compile-native.js and src/main/native-binary.ts.
const EXPECTED = {
  darwin: [
    "macos-key-listener",
    "macos-fast-paste",
    "macos-mic-listener",
    "macos-output-volume",
    "macos-media-control",
  ],
  win32: [
    "windows-key-listener.exe",
    "windows-fast-paste.exe",
    "windows-mic-listener.exe",
    "windows-output-volume.exe",
  ],
  linux: ["linux-key-listener", "linux-fast-paste"],
};

const expected = EXPECTED[platform];
if (!expected) {
  console.log(`[verify-native] Unsupported platform ${platform}, skipping.`);
  process.exit(0);
}

function findPackagedBinDir() {
  const dist = join(ROOT, "dist");
  try {
    if (platform === "darwin") {
      // dist/mac[-arm64]/Freestyle.app/Contents/Resources/bin
      for (const entry of readdirSync(dist)) {
        if (!entry.startsWith("mac")) continue;
        const macDir = join(dist, entry);
        for (const app of readdirSync(macDir)) {
          if (!app.endsWith(".app")) continue;
          return join(macDir, app, "Contents", "Resources", "bin");
        }
      }
    } else if (platform === "win32") {
      return join(dist, "win-unpacked", "resources", "bin");
    } else {
      return join(dist, "linux-unpacked", "resources", "bin");
    }
  } catch {
    // fall through
  }
  return null;
}

function checkDir(label, dir) {
  const missing = [];
  for (const name of expected) {
    const path = join(dir, name);
    try {
      const stats = statSync(path);
      if (!stats.isFile() || stats.size === 0) missing.push(name);
    } catch {
      missing.push(name);
    }
  }
  if (missing.length > 0) {
    console.error(
      `[verify-native] MISSING in ${label} (${dir}): ${missing.join(", ")}`,
    );
    return false;
  }
  console.log(
    `[verify-native] OK: ${label} has all ${expected.length} binaries.`,
  );
  return true;
}

let ok = checkDir(
  "source",
  join(ROOT, "resources", "bin", `${platform}-${arch}`),
);

if (!sourceOnly) {
  const packagedBinDir = findPackagedBinDir();
  if (!packagedBinDir) {
    console.error(
      "[verify-native] Could not locate the unpacked package under dist/. Did electron-builder run?",
    );
    ok = false;
  } else {
    ok = checkDir("packaged app", packagedBinDir) && ok;
  }
}

process.exit(ok ? 0 : 1);
