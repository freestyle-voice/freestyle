#!/usr/bin/env node

/**
 * Fail if a linux-x64 whisper-server binary contains AVX-512 instructions.
 * Used in CI after building bundled release binaries.
 */

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const binary = join(
  __dirname,
  "..",
  "resources",
  "whisper",
  "linux-x64",
  "whisper-server",
);

if (!existsSync(binary)) {
  console.error(`whisper-server not found at ${binary}`);
  process.exit(1);
}

const disasm = execFileSync("objdump", ["-d", binary], {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});

// EVEX-encoded ops use ZMM registers; baseline AVX2 builds must not contain these.
if (/\b(zmm|evex)\b/i.test(disasm)) {
  console.error(
    "whisper-server contains AVX-512 instructions; rebuild with -DGGML_NATIVE=OFF",
  );
  process.exit(1);
}

console.log("whisper-server is AVX-512-free");
