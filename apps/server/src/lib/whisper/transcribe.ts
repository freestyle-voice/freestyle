import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { TranscribeResult } from "../streaming/types.js";
import { findWhisperBinary } from "./binary.js";
import { getDownloadedModelPath } from "./models.js";

interface WhisperTranscribeOptions {
  audio: Uint8Array;
  modelId: string;
  language?: string;
}

function getTempDir(): string {
  const dir = join(tmpdir(), "freestyle-whisper");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export async function transcribeWithWhisper(
  opts: WhisperTranscribeOptions,
): Promise<TranscribeResult> {
  const binaryPath = findWhisperBinary();
  if (!binaryPath) {
    throw new Error(
      "whisper.cpp binary not found. It should be bundled with the app.",
    );
  }

  const modelPath = getDownloadedModelPath(opts.modelId);
  if (!modelPath) {
    throw new Error(
      `Whisper model "${opts.modelId}" is not downloaded. Download it from Settings > Models.`,
    );
  }

  const tempDir = getTempDir();
  const id = randomBytes(8).toString("hex");
  const wavPath = join(tempDir, `input-${id}.wav`);

  try {
    writeFileSync(wavPath, opts.audio);

    const args = [
      "--model",
      modelPath,
      "--file",
      wavPath,
      "--no-prints",
      "--no-fallback",
      "--beam-size",
      "1",
      "--best-of",
      "1",
      "--no-timestamps",
    ];

    if (opts.language && opts.language !== "auto") {
      args.push("--language", opts.language);
    }

    const result = await runWhisperProcess(binaryPath, args);
    return parseWhisperOutput(result);
  } finally {
    try {
      if (existsSync(wavPath)) unlinkSync(wavPath);
    } catch {}
  }
}

function runWhisperProcess(
  binaryPath: string,
  args: string[],
): Promise<string> {
  return new Promise((resolve, reject) => {
    const binDir = dirname(binaryPath);
    const proc = spawn(binaryPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 120_000,
      cwd: binDir,
      env: {
        ...process.env,
        PATH: `${binDir}${process.platform === "win32" ? ";" : ":"}${process.env.PATH ?? ""}`,
      },
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (data: Buffer) => {
      stdout += data.toString();
    });

    proc.stderr.on("data", (data: Buffer) => {
      stderr += data.toString();
    });

    proc.on("error", (err) => {
      reject(new Error(`Failed to start whisper.cpp: ${err.message}`));
    });

    proc.on("close", (code) => {
      if (code === 3221225781) {
        reject(
          new Error(
            "whisper.cpp failed: a required system library is missing. " +
              "Please install the Visual C++ Redistributable from " +
              "https://aka.ms/vs/17/release/vc_redist.x64.exe",
          ),
        );
        return;
      }
      if (code !== 0) {
        const detail = stderr.trim() || stdout.trim() || `exit code ${code}`;
        reject(new Error(`whisper.cpp failed: ${detail}`));
        return;
      }
      resolve(stdout);
    });
  });
}

function parseWhisperOutput(raw: string): TranscribeResult {
  const text = raw
    .trim()
    .split("\n")
    .map((line) => line.replace(/^\[[\d:.,\s\->]+\]\s*/, "").trim())
    .filter(Boolean)
    .join(" ")
    .trim();

  return { text };
}
