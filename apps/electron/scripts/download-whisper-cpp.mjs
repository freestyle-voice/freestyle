#!/usr/bin/env node

/**
 * Download pre-built whisper.cpp binaries for the current platform.
 *
 * Usage:
 *   node scripts/download-whisper-cpp.mjs           # current platform only
 *   node scripts/download-whisper-cpp.mjs --all      # all platforms
 *
 * Binaries are placed in resources/whisper/<platform>-<arch>/
 */

import { chmodSync, createWriteStream, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// whisper.cpp release tag to download
const WHISPER_VERSION = "v1.7.5";
const GITHUB_BASE = `https://github.com/ggerganov/whisper.cpp/releases/download/${WHISPER_VERSION}`;

// Map of platform-arch to download info
const PLATFORMS = {
  "darwin-arm64": {
    archive: `whisper-${WHISPER_VERSION}-bin-macos-arm64.zip`,
    binaries: ["whisper-cli", "whisper-server"],
  },
  "darwin-x64": {
    archive: `whisper-${WHISPER_VERSION}-bin-macos-x86_64.zip`,
    binaries: ["whisper-cli", "whisper-server"],
  },
  "linux-x64": {
    archive: `whisper-${WHISPER_VERSION}-bin-ubuntu-x86_64.zip`,
    binaries: ["whisper-cli", "whisper-server"],
  },
  "win32-x64": {
    archive: `whisper-${WHISPER_VERSION}-bin-win-x86_64.zip`,
    binaries: ["whisper-cli.exe", "whisper-server.exe"],
  },
};

async function downloadAndExtract(platformKey) {
  const config = PLATFORMS[platformKey];
  if (!config) {
    console.error(`Unknown platform: ${platformKey}`);
    return;
  }

  const destDir = join(ROOT, "resources", "whisper", platformKey);
  if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });

  const allExist = config.binaries.every((b) => existsSync(join(destDir, b)));
  if (allExist) {
    console.log(`[${platformKey}] Already downloaded, skipping.`);
    return;
  }

  const url = `${GITHUB_BASE}/${config.archive}`;
  console.log(`[${platformKey}] Downloading ${url}...`);

  const tmpZip = join(destDir, "tmp-whisper.zip");

  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) {
    console.error(
      `[${platformKey}] Download failed: ${res.status} ${res.statusText}`,
    );
    console.error(
      `Note: You may need to download whisper.cpp binaries manually from`,
    );
    console.error(`  https://github.com/ggerganov/whisper.cpp/releases`);
    console.error(`  and place them in ${destDir}`);
    return;
  }

  const fileStream = createWriteStream(tmpZip);
  const reader = res.body.getReader();
  const nodeStream = new Readable({
    async read() {
      try {
        const { done, value } = await reader.read();
        if (done) {
          this.push(null);
          return;
        }
        this.push(Buffer.from(value));
      } catch (err) {
        this.destroy(err instanceof Error ? err : new Error(String(err)));
      }
    },
  });
  await pipeline(nodeStream, fileStream);

  console.log(`[${platformKey}] Extracting...`);

  // Use unzip command (available on macOS, Linux, and Git Bash on Windows)
  const { execSync } = await import("node:child_process");
  try {
    execSync(`unzip -o -j "${tmpZip}" -d "${destDir}"`, { stdio: "pipe" });
  } catch {
    console.error(`[${platformKey}] Failed to extract. Please install unzip.`);
    return;
  }

  // Clean up
  const { unlinkSync } = await import("node:fs");
  try {
    unlinkSync(tmpZip);
  } catch {}

  // Make binaries executable on Unix
  if (!platformKey.startsWith("win32")) {
    for (const bin of config.binaries) {
      const binPath = join(destDir, bin);
      if (existsSync(binPath)) {
        chmodSync(binPath, 0o755);
      }
    }
  }

  console.log(`[${platformKey}] Done.`);
}

async function main() {
  const all = process.argv.includes("--all");
  if (all) {
    for (const key of Object.keys(PLATFORMS)) {
      await downloadAndExtract(key);
    }
  } else {
    const key = `${process.platform}-${process.arch}`;
    await downloadAndExtract(key);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
