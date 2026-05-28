import { type ChildProcess, spawn } from "node:child_process";
import { findWhisperServer } from "./binary.js";
import { WHISPER_SERVER_PORT } from "./constants.js";
import { getDownloadedModelPath } from "./models.js";

let serverProcess: ChildProcess | null = null;
let currentModelId: string | null = null;
let serverReady = false;
let startPromise: Promise<void> | null = null;

export function isServerRunning(): boolean {
  return serverProcess !== null && serverReady;
}

export function getServerPort(): number {
  return WHISPER_SERVER_PORT;
}

export async function ensureServerRunning(modelId: string): Promise<void> {
  if (serverProcess && currentModelId === modelId && serverReady) {
    return;
  }

  if (startPromise && currentModelId === modelId) {
    return startPromise;
  }

  await stopServer();

  const promise = doStart(modelId);
  startPromise = promise;
  try {
    await promise;
  } finally {
    if (startPromise === promise) {
      startPromise = null;
    }
  }
}

async function doStart(modelId: string): Promise<void> {
  const serverBinary = findWhisperServer();
  if (!serverBinary) {
    throw new Error("whisper-server binary not found");
  }

  const modelPath = getDownloadedModelPath(modelId);
  if (!modelPath) {
    throw new Error(`Whisper model "${modelId}" not downloaded`);
  }

  currentModelId = modelId;
  serverReady = false;

  const args = [
    "--model",
    modelPath,
    "--port",
    String(WHISPER_SERVER_PORT),
    "--host",
    "127.0.0.1",
    "--convert",
  ];

  const proc = spawn(serverBinary, args, {
    stdio: ["ignore", "pipe", "pipe"],
  });

  serverProcess = proc;

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let stderr = "";

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error("whisper-server failed to start within 30 seconds"));
    }, 30_000);

    function onReady() {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      serverReady = true;
      resolve();
    }

    proc.stdout?.on("data", (data: Buffer) => {
      const text = data.toString();
      if (text.includes("listening") || text.includes("model loaded")) {
        onReady();
      }
    });

    proc.stderr?.on("data", (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      if (text.includes("listening") || text.includes("model loaded")) {
        onReady();
      }
    });

    proc.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      serverProcess = null;
      currentModelId = null;
      reject(new Error(`Failed to start whisper-server: ${err.message}`));
    });

    proc.on("close", (code) => {
      clearTimeout(timeout);
      const wasReady = serverReady;
      serverProcess = null;
      serverReady = false;
      currentModelId = null;

      if (!settled) {
        settled = true;
        const detail = stderr.trim() || `exit code ${code}`;
        reject(new Error(`whisper-server exited unexpectedly: ${detail}`));
      } else if (wasReady) {
        console.error(`whisper-server exited unexpectedly (code ${code})`);
      }
    });
  });

  await new Promise((r) => setTimeout(r, 200));
}

export async function stopServer(): Promise<void> {
  startPromise = null;
  if (!serverProcess) return;

  const proc = serverProcess;
  serverProcess = null;
  currentModelId = null;
  serverReady = false;

  return new Promise((resolve) => {
    let done = false;
    const killTimeout = setTimeout(() => {
      if (done) return;
      try {
        proc.kill("SIGKILL");
      } catch {}
      done = true;
      resolve();
    }, 5_000);

    proc.once("close", () => {
      if (done) return;
      done = true;
      clearTimeout(killTimeout);
      resolve();
    });

    proc.kill("SIGTERM");
  });
}
