#!/usr/bin/env node

/**
 * Download or build whisper.cpp binaries.
 *
 * Usage:
 *   node scripts/download-whisper-cpp.mjs              # dev: ~/.cache/freestyle/whisper-bin/
 *   node scripts/download-whisper-cpp.mjs --resources   # CI:  resources/whisper/{platform}-{arch}/
 *
 * On Windows: downloads pre-built binaries from GitHub releases.
 * On macOS/Linux: builds from source (requires cmake + C compiler).
 *
 * By default binaries land in ~/.cache/freestyle/whisper-bin/ (the
 * location the app checks at runtime).  Pass --resources to place them
 * in resources/whisper/{platform}-{arch}/ so electron-builder can
 * bundle them into the packaged app via extraResources.
 */

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
  unlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { getWhisperCmakeArgs } from "./whisper-cmake-args.mjs";

const VERSION = "1.8.5";
const CACHE_DIR = join(homedir(), ".cache", "freestyle", "whisper-bin");

const __dirname = dirname(fileURLToPath(import.meta.url));
const ELECTRON_ROOT = join(__dirname, "..");
const RESOURCES_DIR = join(
  ELECTRON_ROOT,
  "resources",
  "whisper",
  `${process.platform}-${process.arch}`,
);

function getOutputDir() {
  return process.argv.includes("--resources") ? RESOURCES_DIR : CACHE_DIR;
}

async function fetchToFile(url, dest) {
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} for ${url}`);
  const fileStream = createWriteStream(dest);
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
}

async function buildFromSource(outDir) {
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const srcDir = join(outDir, "whisper.cpp-src");
  const buildDir = join(srcDir, "build");
  const tarPath = join(outDir, `whisper-${VERSION}.tar.gz`);
  const tarballUrl = `https://github.com/ggml-org/whisper.cpp/archive/refs/tags/v${VERSION}.tar.gz`;

  console.log("Downloading whisper.cpp source...");
  await fetchToFile(tarballUrl, tarPath);

  console.log("Extracting...");
  if (existsSync(srcDir)) rmSync(srcDir, { recursive: true, force: true });
  mkdirSync(srcDir, { recursive: true });
  execFileSync("tar", ["xzf", tarPath, "-C", srcDir, "--strip-components=1"], {
    stdio: "pipe",
  });
  try {
    unlinkSync(tarPath);
  } catch {}

  console.log("Building (this may take a minute)...");
  mkdirSync(buildDir, { recursive: true });
  const forBundledRelease = process.argv.includes("--resources");
  execFileSync("cmake", getWhisperCmakeArgs({ forBundledRelease }), {
    cwd: buildDir,
    stdio: "inherit",
    timeout: 60_000,
  });
  execFileSync("cmake", ["--build", ".", "--config", "Release", "-j"], {
    cwd: buildDir,
    stdio: "inherit",
    timeout: 300_000,
  });

  for (const name of ["whisper-cli", "whisper-server"]) {
    const built = join(buildDir, "bin", name);
    if (existsSync(built)) {
      copyFileSync(built, join(outDir, name));
      chmodSync(join(outDir, name), 0o755);
    }
  }

  const libDirs = [join(buildDir, "src"), join(buildDir, "ggml", "src")];
  for (const libDir of libDirs) {
    if (!existsSync(libDir)) continue;
    for (const file of readdirSync(libDir)) {
      if (file.endsWith(".dylib") || /\.so(\.\d+)*$/.test(file)) {
        copyFileSync(join(libDir, file), join(outDir, file));
      }
    }
  }

  if (process.platform === "darwin") {
    for (const name of ["whisper-cli", "whisper-server"]) {
      const binPath = join(outDir, name);
      if (!existsSync(binPath)) continue;
      try {
        execFileSync("install_name_tool", ["-add_rpath", outDir, binPath], {
          stdio: "pipe",
        });
      } catch {}
    }
  }

  try {
    rmSync(srcDir, { recursive: true, force: true });
  } catch {}
  console.log("Done. Binaries at", outDir);
}

async function downloadWindows(outDir) {
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const url = `https://github.com/ggml-org/whisper.cpp/releases/download/v${VERSION}/whisper-bin-x64.zip`;
  const tmpZip = join(outDir, "whisper-bin.zip");

  console.log("Downloading pre-built Windows binaries...");
  await fetchToFile(url, tmpZip);

  execFileSync(
    "powershell",
    [
      "-Command",
      `Expand-Archive -Force -Path '${tmpZip}' -DestinationPath '${outDir}'`,
    ],
    { stdio: "pipe", timeout: 30_000 },
  );

  try {
    unlinkSync(tmpZip);
  } catch {}

  // The upstream zip nests executables inside a Release/ subdirectory.
  // Flatten them so they sit directly inside outDir.
  const releaseDir = join(outDir, "Release");
  if (existsSync(releaseDir)) {
    for (const name of readdirSync(releaseDir)) {
      renameSync(join(releaseDir, name), join(outDir, name));
    }
    rmSync(releaseDir, { recursive: true, force: true });
  }

  console.log("Done. Binaries at", outDir);
}

async function main() {
  const outDir = getOutputDir();
  const cli = process.platform === "win32" ? "whisper-cli.exe" : "whisper-cli";
  if (existsSync(join(outDir, cli))) {
    console.log("whisper-cli already exists at", outDir);
    return;
  }

  if (process.platform === "win32") {
    await downloadWindows(outDir);
  } else {
    await buildFromSource(outDir);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
