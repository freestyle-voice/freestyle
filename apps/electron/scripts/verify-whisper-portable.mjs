#!/usr/bin/env node

/**
 * Fail if bundled linux-x64 whisper binaries contain AVX-512 instructions.
 * Used in CI after building bundled release binaries.
 *
 * Best-effort check: scans objdump output for EVEX/ZMM/mask-register patterns.
 * False positives are possible (e.g. symbol names); false negatives are possible
 * for unusual EVEX encodings. Catches the common GGML_NATIVE regression.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const whisperDir = join(__dirname, "..", "resources", "whisper", "linux-x64");

const BINARIES = ["whisper-server", "whisper-cli"];

// EVEX-encoded ops use ZMM registers and k0–k7 mask registers; baseline AVX2 builds must not contain these.
const AVX512_PATTERN = /\b(zmm|evex)\b|%k[0-7]/i;

for (const name of BINARIES) {
  const binary = join(whisperDir, name);

  if (!existsSync(binary)) {
    console.error(`${name} not found at ${binary}`);
    process.exit(1);
  }

  const disasm = execFileSync("objdump", ["-d", binary], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

  if (AVX512_PATTERN.test(disasm)) {
    console.error(
      `${name} contains AVX-512 instructions; rebuild with -DGGML_NATIVE=OFF`,
    );
    process.exit(1);
  }

  console.log(`${name} is AVX-512-free`);
}
