#!/usr/bin/env node

/**
 * Download or build whisper.cpp binaries for development.
 *
 * Usage:
 *   node scripts/download-whisper-cpp.mjs
 *
 * On Windows: downloads pre-built binaries from GitHub releases.
 * On macOS/Linux: builds from source (requires cmake + C compiler).
 *
 * Binaries are placed in ~/.cache/freestyle/whisper-bin/ (same
 * location the app uses at runtime, so the dev build picks them up).
 */

import { execFileSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  unlinkSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const VERSION = "1.7.5";
const WIN_VERSION = "1.8.5";
const BIN_DIR = join(homedir(), ".cache", "freestyle", "whisper-bin");

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

async function buildFromSource() {
  if (!existsSync(BIN_DIR)) mkdirSync(BIN_DIR, { recursive: true });

  const srcDir = join(BIN_DIR, "whisper.cpp-src");
  const buildDir = join(srcDir, "build");
  const tarPath = join(BIN_DIR, `whisper-${VERSION}.tar.gz`);
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
  execFileSync(
    "cmake",
    ["..", "-DCMAKE_BUILD_TYPE=Release", "-DBUILD_SHARED_LIBS=OFF"],
    {
      cwd: buildDir,
      stdio: "inherit",
      timeout: 60_000,
    },
  );
  execFileSync("cmake", ["--build", ".", "--config", "Release", "-j"], {
    cwd: buildDir,
    stdio: "inherit",
    timeout: 300_000,
  });

  for (const name of ["whisper-cli", "whisper-server"]) {
    const built = join(buildDir, "bin", name);
    if (existsSync(built)) {
      copyFileSync(built, join(BIN_DIR, name));
      chmodSync(join(BIN_DIR, name), 0o755);
    }
  }

  const libDirs = [join(buildDir, "src"), join(buildDir, "ggml", "src")];
  for (const libDir of libDirs) {
    if (!existsSync(libDir)) continue;
    for (const file of readdirSync(libDir)) {
      if (file.endsWith(".dylib") || /\.so(\.\d+)*$/.test(file)) {
        copyFileSync(join(libDir, file), join(BIN_DIR, file));
      }
    }
  }

  if (process.platform === "darwin") {
    for (const name of ["whisper-cli", "whisper-server"]) {
      const binPath = join(BIN_DIR, name);
      if (!existsSync(binPath)) continue;
      try {
        execFileSync("install_name_tool", ["-add_rpath", BIN_DIR, binPath], {
          stdio: "pipe",
        });
      } catch {}
    }
  }

  try {
    rmSync(srcDir, { recursive: true, force: true });
  } catch {}
  console.log("Done. Binaries at", BIN_DIR);
}

async function downloadWindows() {
  if (!existsSync(BIN_DIR)) mkdirSync(BIN_DIR, { recursive: true });

  const url = `https://github.com/ggml-org/whisper.cpp/releases/download/v${WIN_VERSION}/whisper-bin-x64.zip`;
  const tmpZip = join(BIN_DIR, "whisper-bin.zip");

  console.log("Downloading pre-built Windows binaries...");
  await fetchToFile(url, tmpZip);

  execFileSync(
    "powershell",
    [
      "-Command",
      `Expand-Archive -Force -Path '${tmpZip}' -DestinationPath '${BIN_DIR}'`,
    ],
    { stdio: "pipe", timeout: 30_000 },
  );

  try {
    unlinkSync(tmpZip);
  } catch {}
  console.log("Done. Binaries at", BIN_DIR);
}

async function main() {
  const cli = process.platform === "win32" ? "whisper-cli.exe" : "whisper-cli";
  if (existsSync(join(BIN_DIR, cli))) {
    console.log("whisper-cli already exists at", BIN_DIR);
    return;
  }

  if (process.platform === "win32") {
    await downloadWindows();
  } else {
    await buildFromSource();
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
