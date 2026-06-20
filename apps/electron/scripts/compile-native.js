#!/usr/bin/env node

/**
 * Native Binary Compilation Script
 *
 * Compiles platform-specific native binaries from source files in native/.
 * Runs during dev (predev) and build (prebuild) steps.
 *
 * macOS:  swiftc for Swift sources (universal arm64+x86_64)
 * Windows: cl.exe (MSVC) or gcc (MinGW) for C sources
 * Linux:  gcc for C sources with X11/XTest/GIO/uinput support
 */

import { execFileSync, execSync } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const NATIVE_DIR = join(ROOT, "native");
const BIN_DIR = join(ROOT, "resources", "bin");

const platform = process.platform;
const arch = process.arch;
const outputDir = join(BIN_DIR, `${platform}-${arch}`);

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function run(cmd, args, opts = {}) {
  console.log(`  $ ${cmd} ${args.join(" ")}`);
  try {
    execFileSync(cmd, args, { stdio: "inherit", ...opts });
    return true;
  } catch (err) {
    console.error(`  Failed: ${err.message}`);
    return false;
  }
}

function runShell(cmd, opts = {}) {
  console.log(`  $ ${cmd}`);
  try {
    execSync(cmd, { stdio: "inherit", ...opts });
    return true;
  } catch (err) {
    console.error(`  Failed: ${err.message}`);
    return false;
  }
}

function compileMacOS() {
  console.log("\n[compile:native] Building macOS binaries...\n");

  const swiftcArgs = (src, out, frameworks) => {
    const args = ["-O", src, "-o", out];
    for (const fw of frameworks) {
      args.push("-framework", fw);
    }
    return args;
  };

  const binaries = [
    {
      name: "macos-key-listener",
      src: "macos-key-listener.swift",
      frameworks: ["Cocoa"],
    },
    {
      name: "macos-fast-paste",
      src: "macos-fast-paste.swift",
      frameworks: ["Cocoa"],
    },
    {
      name: "macos-mic-listener",
      src: "macos-mic-listener.swift",
      frameworks: ["CoreAudio", "Foundation"],
    },
    {
      name: "macos-output-volume",
      src: "macos-output-volume.swift",
      frameworks: ["CoreAudio", "Foundation"],
    },
    {
      name: "macos-media-control",
      src: "macos-media-control.swift",
      frameworks: ["AppKit", "Foundation"],
    },
  ];

  for (const bin of binaries) {
    console.log(`  Compiling ${bin.name}...`);
    const src = join(NATIVE_DIR, bin.src);
    const out = join(outputDir, bin.name);

    const ok = run("swiftc", swiftcArgs(src, out, bin.frameworks));
    if (ok) {
      chmodSync(out, 0o755);
      console.log(`  -> ${out}`);
    } else {
      console.warn(
        `  WARNING: Failed to compile ${bin.name}. Hotkey/paste may fall back to legacy mode.`,
      );
    }
  }

  vendorCliclick();
}

/**
 * Bundle the `cliclick` desktop-control helper for computer use (Part D).
 * Copy-only by default; pass FREESTYLE_INSTALL_CLICLICK=1 (the `vendor:cliclick`
 * script) to `brew install` it first. Best-effort — never fails the build.
 */
function vendorCliclick() {
  const out = join(outputDir, "cliclick");
  if (existsSync(out)) {
    console.log("  cliclick already vendored.");
    return;
  }
  const which = () => {
    try {
      return execSync("command -v cliclick", { encoding: "utf8" }).trim();
    } catch {
      return "";
    }
  };

  let src = which();
  if (!src && process.env.FREESTYLE_INSTALL_CLICLICK === "1") {
    const brew = ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"].find(
      existsSync,
    );
    if (brew) {
      console.log("  Installing cliclick via Homebrew...");
      run(brew, ["install", "cliclick"]);
      src = which();
    }
  }

  if (!src || !existsSync(src)) {
    console.warn(
      "  cliclick not found — computer use will be unavailable until it's installed. " +
        "Run `pnpm --filter @freestyle/electron vendor:cliclick` to bundle it.",
    );
    return;
  }

  try {
    // copyFileSync dereferences the Homebrew symlink, copying the standalone
    // Mach-O so it ships (and gets codesigned) with the app.
    copyFileSync(src, out);
    chmodSync(out, 0o755);
    console.log(`  Vendored cliclick -> ${out}`);
  } catch (err) {
    console.warn(`  WARNING: Failed to vendor cliclick: ${err.message}`);
  }
}

function compileWindows() {
  console.log("\n[compile:native] Building Windows binaries...\n");

  const binaries = [
    {
      name: "windows-key-listener.exe",
      src: "windows-key-listener.c",
      libs: ["user32.lib"],
    },
    {
      name: "windows-fast-paste.exe",
      src: "windows-fast-paste.c",
      libs: ["user32.lib"],
    },
    {
      name: "windows-mic-listener.exe",
      src: "windows-mic-listener.c",
      libs: ["ole32.lib", "oleaut32.lib"],
    },
    {
      name: "windows-output-volume.exe",
      src: "windows-output-volume.c",
      libs: ["ole32.lib"],
    },
  ];

  for (const bin of binaries) {
    console.log(`  Compiling ${bin.name}...`);
    const src = join(NATIVE_DIR, bin.src);
    const out = join(outputDir, bin.name);

    // Try MSVC first (cl.exe), fall back to gcc (MinGW)
    const clArgs = ["/O2", src, `/Fe:${out}`, ...bin.libs];
    let ok = run("cl", clArgs);

    if (!ok) {
      console.log("  MSVC not found, trying MinGW gcc...");
      const gccLibs = bin.libs.map((l) => `-l${l.replace(".lib", "")}`);
      ok = run("gcc", ["-O2", "-static-libgcc", src, "-o", out, ...gccLibs]);
    }

    if (!ok) {
      console.warn(
        `  WARNING: Failed to compile ${bin.name}. Feature may fall back to legacy mode.`,
      );
    } else {
      console.log(`  -> ${out}`);
    }
  }
}

function compileLinux() {
  console.log("\n[compile:native] Building Linux binaries...\n");

  // Check for required dev packages
  const hasPkgConfig = (() => {
    try {
      execSync("pkg-config --version", { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  })();

  const hasGio =
    hasPkgConfig &&
    (() => {
      try {
        execSync("pkg-config --exists gio-2.0", { stdio: "ignore" });
        return true;
      } catch {
        return false;
      }
    })();

  // linux-fast-paste (full build with uinput + portal if possible)
  console.log("  Compiling linux-fast-paste...");
  {
    const src = join(NATIVE_DIR, "linux-fast-paste.c");
    const out = join(outputDir, "linux-fast-paste");
    const defines = ["-DHAVE_UINPUT"];
    let cflags = "";
    let libs = "-lX11 -lXtst";

    if (hasGio) {
      defines.push("-DHAVE_GIO");
      try {
        cflags = execSync("pkg-config --cflags gio-2.0", {
          encoding: "utf8",
        }).trim();
        libs +=
          " " +
          execSync("pkg-config --libs gio-2.0", { encoding: "utf8" }).trim();
      } catch {
        // Fall through without GIO
      }
    }

    const cmd = `gcc -O2 ${defines.join(" ")} ${cflags} ${src} -o ${out} ${libs}`;
    const ok = runShell(cmd);
    if (ok) {
      chmodSync(out, 0o755);
      console.log(`  -> ${out}`);
    } else {
      // Fallback: minimal build without GIO/uinput
      console.log("  Retrying with minimal build (XTest only)...");
      const minCmd = `gcc -O2 ${src} -o ${out} -lX11 -lXtst`;
      const minOk = runShell(minCmd);
      if (minOk) {
        chmodSync(out, 0o755);
        console.log(`  -> ${out} (XTest only)`);
      } else {
        console.warn("  WARNING: Failed to compile linux-fast-paste.");
      }
    }
  }

  // linux-key-listener
  console.log("  Compiling linux-key-listener...");
  {
    const src = join(NATIVE_DIR, "linux-key-listener.c");
    const out = join(outputDir, "linux-key-listener");
    const ok = runShell(`gcc -O2 ${src} -o ${out}`);
    if (ok) {
      chmodSync(out, 0o755);
      console.log(`  -> ${out}`);
    } else {
      console.warn("  WARNING: Failed to compile linux-key-listener.");
    }
  }
}

// Main
ensureDir(outputDir);
console.log(`[compile:native] Platform: ${platform}, Arch: ${arch}`);
console.log(`[compile:native] Output: ${outputDir}`);

switch (platform) {
  case "darwin":
    compileMacOS();
    break;
  case "win32":
    compileWindows();
    break;
  case "linux":
    compileLinux();
    break;
  default:
    console.log(
      `[compile:native] Unsupported platform: ${platform}, skipping.`,
    );
}

console.log("\n[compile:native] Done.\n");
