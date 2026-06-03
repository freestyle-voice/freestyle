import { type ChildProcess, spawn } from "node:child_process";
import { createAppLogger } from "@freestyle/utils";
import { findWhisperServer } from "./binary.js";
import { WHISPER_SERVER_PORT } from "./constants.js";
import { getDownloadedModelPath } from "./models.js";

const log = createAppLogger("whisper");
const serverLog = createAppLogger("whisper-server");
const MAX_RESTARTS = 3;
const RESTART_COOLDOWN_MS = 3_000;
const STABILITY_THRESHOLD_MS = 30_000;

let serverProcess: ChildProcess | null = null;
let currentModelId: string | null = null;
let serverReady = false;
let startPromise: Promise<void> | null = null;
let autoRestart = false;
let restartCount = 0;
let stabilityTimer: ReturnType<typeof setTimeout> | null = null;
let serverFailed = false;

export function isServerRunning(): boolean {
  return serverProcess !== null && serverReady;
}

export function isServerFailed(): boolean {
  return serverFailed;
}

export function getServerPort(): number {
  return WHISPER_SERVER_PORT;
}

export function startInBackground(modelId: string): void {
  if (serverProcess && currentModelId === modelId && serverReady) return;
  if (startPromise && currentModelId === modelId) return;

  serverFailed = false;
  restartCount = 0;
  autoRestart = true;

  ensureServerRunning(modelId)
    .then(() => {
      log.info(`Server ready on port ${WHISPER_SERVER_PORT}`);
    })
    .catch((err) => {
      log.error(`Background server start failed: ${err.message}`);
    });
}

export async function ensureServerRunning(modelId: string): Promise<void> {
  if (serverProcess && currentModelId === modelId && serverReady) {
    return;
  }

  if (startPromise && currentModelId === modelId) {
    return startPromise;
  }

  await stopServer();
  autoRestart = true;
  serverFailed = false;

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
      const lastOutput = stderr.trim().slice(-500);
      reject(
        new Error(
          `whisper-server failed to start within 90 seconds. Last output:\n${lastOutput}`,
        ),
      );
    }, 90_000);

    let healthCheckInterval: ReturnType<typeof setInterval> | null = null;

    function onReady() {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (healthCheckInterval) clearInterval(healthCheckInterval);
      serverReady = true;
      resolve();
    }

    function checkReady(text: string): void {
      if (
        text.includes("listening") ||
        text.includes("model loaded") ||
        text.includes("http://") ||
        text.includes("running on")
      ) {
        onReady();
      }
    }

    proc.stdout?.on("data", (data: Buffer) => {
      const text = data.toString();
      serverLog.debug(`stdout: ${text.trimEnd()}`);
      checkReady(text);
    });

    proc.stderr?.on("data", (data: Buffer) => {
      const text = data.toString();
      stderr += text;
      serverLog.debug(`stderr: ${text.trimEnd()}`);
      checkReady(text);
    });

    // Poll the HTTP endpoint as a fallback readiness check
    healthCheckInterval = setInterval(async () => {
      if (settled) {
        if (healthCheckInterval) clearInterval(healthCheckInterval);
        return;
      }
      try {
        const res = await fetch(`http://127.0.0.1:${WHISPER_SERVER_PORT}/`, {
          signal: AbortSignal.timeout(1000),
        });
        if (res.ok || res.status === 404 || res.status === 405) {
          onReady();
        }
      } catch {}
    }, 2000);

    proc.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (healthCheckInterval) clearInterval(healthCheckInterval);
      serverProcess = null;
      currentModelId = null;
      reject(new Error(`Failed to start whisper-server: ${err.message}`));
    });

    proc.on("close", (code) => {
      clearTimeout(timeout);
      if (healthCheckInterval) clearInterval(healthCheckInterval);
      clearStabilityTimer();
      const wasReady = serverReady;
      const modelForRestart = currentModelId;
      serverProcess = null;
      serverReady = false;

      if (!settled) {
        settled = true;
        currentModelId = null;
        const detail = stderr.trim() || `exit code ${code}`;
        reject(new Error(`whisper-server exited unexpectedly: ${detail}`));
        return;
      }

      if (wasReady && autoRestart && modelForRestart) {
        scheduleRestart(modelForRestart);
      }
    });
  });

  startStabilityTimer();
}

function scheduleRestart(modelId: string): void {
  restartCount++;
  if (restartCount > MAX_RESTARTS) {
    log.error(`Server crashed ${MAX_RESTARTS} times, not restarting`);
    serverFailed = true;
    autoRestart = false;
    currentModelId = null;
    return;
  }

  log.info(
    `Server crashed, restarting in ${RESTART_COOLDOWN_MS / 1000}s (attempt ${restartCount}/${MAX_RESTARTS})`,
  );

  setTimeout(() => {
    if (!autoRestart) return;
    ensureServerRunning(modelId).catch((err) => {
      log.error(`Restart failed: ${err.message}`);
    });
  }, RESTART_COOLDOWN_MS);
}

function startStabilityTimer(): void {
  clearStabilityTimer();
  stabilityTimer = setTimeout(() => {
    if (serverReady) {
      restartCount = 0;
    }
  }, STABILITY_THRESHOLD_MS);
}

function clearStabilityTimer(): void {
  if (stabilityTimer) {
    clearTimeout(stabilityTimer);
    stabilityTimer = null;
  }
}

export async function stopServer(): Promise<void> {
  autoRestart = false;
  startPromise = null;
  clearStabilityTimer();
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
        proc.kill();
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

    try {
      proc.kill(process.platform === "win32" ? undefined : "SIGTERM");
    } catch {
      done = true;
      clearTimeout(killTimeout);
      resolve();
    }
  });
}
