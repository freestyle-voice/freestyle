import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAppLogger } from "@freestyle/utils";
import { getDb } from "../db.js";
import { getMlxAsrModel, isAppleSiliconMac } from "./constants.js";
import {
  describeMlxSetupBlocker,
  findPythonExecutable,
  getMlxAsrServerScriptPath,
  getMlxAsrWorkerPath,
  isMlxAudioInstalled,
} from "./python.js";

const log = createAppLogger("mlx-asr");
const START_TIMEOUT_MS = 120_000;
const TRANSCRIBE_TIMEOUT_MS = 300_000;
const DEFAULT_KEEP_ALIVE_MINUTES = 10;
const MAX_KEEP_ALIVE_MINUTES = 10;

interface WorkerResponse {
  id?: number;
  type?: string;
  text?: string;
  error?: string;
  model?: string;
}

interface PendingRequest {
  resolve: (text: string) => void;
  reject: (err: Error) => void;
  onPartial?: (text: string) => void;
  timeout: ReturnType<typeof setTimeout>;
}

let workerProcess: ChildProcess | null = null;
let currentModelId: string | null = null;
let workerReady = false;
let workerFailed = false;
let startPromise: Promise<void> | null = null;
let stdoutBuffer = "";
let nextRequestId = 1;
let unloadTimer: ReturnType<typeof setTimeout> | null = null;
let lifecyclePromise: Promise<void> = Promise.resolve();
const pending = new Map<number, PendingRequest>();

let readyResolve: (() => void) | null = null;
let readyReject: ((err: Error) => void) | null = null;

function stopWorkerOnExit(): void {
  const proc = workerProcess;
  if (!proc) return;
  try {
    proc.stdin?.write(`${JSON.stringify({ type: "shutdown" })}\n`);
  } catch {
    // best effort during process teardown
  }
  try {
    proc.kill(process.platform === "win32" ? undefined : "SIGTERM");
  } catch {
    // best effort during process teardown
  }
}

process.once("exit", stopWorkerOnExit);

export function isMlxServerRunning(): boolean {
  return workerProcess !== null && workerReady;
}

export function isMlxServerFailed(): boolean {
  return workerFailed;
}

export function canRunMlxAsr(): boolean {
  if (!isAppleSiliconMac()) return false;
  if (existsSync(getMlxAsrWorkerPath())) return true;
  const python = findPythonExecutable();
  if (!python) return false;
  if (!existsSync(getMlxAsrServerScriptPath())) return false;
  return isMlxAudioInstalled(python);
}

export function getMlxAsrKeepAliveMinutes(): number {
  try {
    const db = getDb();
    const row = db
      .prepare(
        "SELECT value FROM settings WHERE key = 'mlx_asr_keep_alive_minutes'",
      )
      .get() as { value: string } | undefined;
    if (!row) return DEFAULT_KEEP_ALIVE_MINUTES;
    const minutes = Number(row.value);
    if (!Number.isFinite(minutes)) return DEFAULT_KEEP_ALIVE_MINUTES;
    return Math.min(Math.max(Math.round(minutes), 0), MAX_KEEP_ALIVE_MINUTES);
  } catch {
    return DEFAULT_KEEP_ALIVE_MINUTES;
  }
}

export function startMlxInBackground(modelId: string): void {
  if (getMlxAsrKeepAliveMinutes() === 0) return;
  if (workerProcess && currentModelId === modelId && workerReady) return;
  if (startPromise && currentModelId === modelId) return;

  workerFailed = false;
  ensureMlxServerRunning(modelId)
    .then(() => {
      log.info("Worker ready");
    })
    .catch((err: Error) => {
      log.error(`Background worker start failed: ${err.message}`);
    });
}

export function applyMlxAsrRetentionPolicy(): void {
  if (!workerProcess) return;
  if (pending.size > 0 || startPromise) return;
  scheduleUnload();
}

export function ensureMlxServerRunning(modelId: string): Promise<void> {
  const run = lifecyclePromise.then(() =>
    ensureMlxServerRunningLocked(modelId),
  );
  lifecyclePromise = run.catch(() => undefined);
  return run;
}

async function ensureMlxServerRunningLocked(modelId: string): Promise<void> {
  clearUnloadTimer();
  if (workerProcess && currentModelId === modelId && workerReady) {
    return;
  }
  if (startPromise && currentModelId === modelId) {
    return startPromise;
  }

  await stopMlxServer();
  workerFailed = false;
  currentModelId = modelId;

  const promise = startWorker(modelId);
  startPromise = promise;
  try {
    await promise;
  } finally {
    if (startPromise === promise) {
      startPromise = null;
    }
  }
}

export async function transcribeWithMlxAsr(opts: {
  modelId: string;
  audio: Uint8Array;
  language?: string;
  context?: string;
  onPartial?: (text: string) => void;
  deferUnload?: boolean;
}): Promise<string> {
  await ensureMlxServerRunning(opts.modelId);

  const dir = join(tmpdir(), "freestyle-mlx-asr");
  await mkdir(dir, { recursive: true });
  const audioPath = join(dir, `${randomUUID()}.wav`);
  await writeFile(audioPath, opts.audio);

  try {
    return await sendTranscribeRequest({
      audioPath,
      language: opts.language,
      context: opts.context,
      stream: !!opts.onPartial,
      onPartial: opts.onPartial,
    });
  } finally {
    await unlink(audioPath).catch(() => undefined);
    if (!opts.deferUnload) scheduleUnload();
  }
}

export async function transcribePcmWithMlxAsr(opts: {
  modelId: string;
  pcm: Uint8Array;
  sampleRate: number;
  language?: string;
  context?: string;
  live?: boolean;
  onPartial?: (text: string) => void;
  deferUnload?: boolean;
}): Promise<string> {
  await ensureMlxServerRunning(opts.modelId);

  const dir = join(tmpdir(), "freestyle-mlx-asr");
  await mkdir(dir, { recursive: true });
  const audioPath = join(dir, `${randomUUID()}.pcm`);
  await writeFile(audioPath, opts.pcm);

  try {
    return await sendTranscribeRequest({
      audioPath,
      audioFormat: "pcm_s16le",
      sampleRate: opts.sampleRate,
      language: opts.language,
      context: opts.context,
      live: opts.live,
      stream: !!opts.onPartial,
      onPartial: opts.onPartial,
    });
  } finally {
    await unlink(audioPath).catch(() => undefined);
    if (!opts.deferUnload) scheduleUnload();
  }
}

interface WorkerLaunchCandidate {
  label: string;
  command: string;
  spawnArgs: string[];
}

function workerLaunchCandidates(modelHfId: string): WorkerLaunchCandidate[] {
  const modelArgs = ["--model", modelHfId];
  const candidates: WorkerLaunchCandidate[] = [];

  const workerPath = getMlxAsrWorkerPath();
  if (workerPath && existsSync(workerPath)) {
    candidates.push({
      label: "bundled worker",
      command: workerPath,
      spawnArgs: modelArgs,
    });
  }

  const python = findPythonExecutable();
  const scriptPath = getMlxAsrServerScriptPath();
  if (
    python &&
    scriptPath &&
    existsSync(scriptPath) &&
    isMlxAudioInstalled(python)
  ) {
    candidates.push({
      label: "python script",
      command: python,
      spawnArgs: [scriptPath, ...modelArgs],
    });
  }

  return candidates;
}

async function spawnWorkerProcess(
  command: string,
  spawnArgs: string[],
): Promise<void> {
  const proc = spawn(command, spawnArgs, {
    stdio: ["pipe", "pipe", "pipe"],
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
  });

  workerProcess = proc;
  workerReady = false;
  stdoutBuffer = "";

  proc.stdout?.on("data", (data: Buffer) => {
    stdoutBuffer += data.toString();
    let newline = stdoutBuffer.indexOf("\n");
    while (newline >= 0) {
      const line = stdoutBuffer.slice(0, newline).trim();
      stdoutBuffer = stdoutBuffer.slice(newline + 1);
      if (line) handleWorkerLine(line);
      newline = stdoutBuffer.indexOf("\n");
    }
  });

  proc.stderr?.on("data", (data: Buffer) => {
    const text = data.toString().trimEnd();
    if (!text) return;
    log.warn(text);
  });

  proc.on("error", (err) => {
    if (workerProcess !== proc) return;
    failWorker(new Error(`Failed to start mlx-asr worker: ${err.message}`));
  });

  proc.on("close", (code) => {
    if (workerProcess !== proc) return;
    failWorker(
      new Error(`mlx-asr worker exited unexpectedly: exit code ${code}`),
    );
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      const err = new Error(
        "mlx-asr worker failed to start within 120 seconds.",
      );
      readyResolve = null;
      readyReject = null;
      failWorker(err);
      try {
        proc.kill(process.platform === "win32" ? undefined : "SIGKILL");
      } catch {
        // ignore
      }
      reject(err);
    }, START_TIMEOUT_MS);

    readyResolve = () => {
      clearTimeout(timeout);
      resolve();
    };
    readyReject = (err) => {
      clearTimeout(timeout);
      reject(err);
    };
  });
}

async function startWorker(modelId: string): Promise<void> {
  const def = getMlxAsrModel(modelId);
  if (!def) {
    throw new Error(`Unknown MLX ASR model: ${modelId}`);
  }

  const candidates = workerLaunchCandidates(def.hfId);
  if (candidates.length === 0) {
    throw new Error(
      describeMlxSetupBlocker() ??
        "Bundled MLX ASR worker or Python 3 with mlx-audio not found.",
    );
  }

  let lastError: Error | null = null;

  for (const candidate of candidates) {
    workerFailed = false;
    try {
      await spawnWorkerProcess(candidate.command, candidate.spawnArgs);
      log.debug(`started via ${candidate.label}`);
      return;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      await stopMlxServer().catch(() => undefined);
      log.debug(`${candidate.label} failed: ${lastError.message}`);
    }
  }

  workerFailed = true;
  throw (
    lastError ??
    new Error("MLX ASR worker failed to start with every launch method.")
  );
}

function handleWorkerLine(line: string): void {
  let message: WorkerResponse;
  try {
    message = JSON.parse(line) as WorkerResponse;
  } catch {
    log.debug(line);
    return;
  }

  if (message.type === "ready") {
    workerReady = true;
    readyResolve?.();
    readyResolve = null;
    readyReject = null;
    return;
  }

  if (typeof message.id !== "number") return;
  const req = pending.get(message.id);
  if (!req) return;

  if (message.type === "partial") {
    req.onPartial?.(message.text ?? "");
    return;
  }

  pending.delete(message.id);
  clearTimeout(req.timeout);
  if (message.error) {
    req.reject(new Error(message.error));
    return;
  }
  req.resolve(message.text ?? "");
}

function sendTranscribeRequest(opts: {
  audioPath: string;
  audioFormat?: "wav" | "pcm_s16le";
  sampleRate?: number;
  language?: string;
  context?: string;
  live?: boolean;
  stream?: boolean;
  onPartial?: (text: string) => void;
}): Promise<string> {
  clearUnloadTimer();

  const proc = workerProcess;
  if (!proc?.stdin || !workerReady) {
    return Promise.reject(new Error("mlx-asr worker is not running"));
  }

  const id = nextRequestId++;
  const payload = {
    id,
    type: "transcribe",
    audio_path: opts.audioPath,
    audio_format: opts.audioFormat ?? "wav",
    sample_rate: opts.sampleRate,
    language: opts.language,
    context: opts.context,
    live: opts.live,
    stream: opts.stream,
  };

  return new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(id);
      reject(new Error("MLX ASR inference timed out."));
    }, TRANSCRIBE_TIMEOUT_MS);

    pending.set(id, { resolve, reject, onPartial: opts.onPartial, timeout });
    proc.stdin?.write(`${JSON.stringify(payload)}\n`, (err) => {
      if (!err) return;
      const req = pending.get(id);
      if (!req) return;
      pending.delete(id);
      clearTimeout(req.timeout);
      req.reject(
        new Error(`Failed to write to mlx-asr worker: ${err.message}`),
      );
    });
  });
}

function failWorker(err: Error): void {
  clearUnloadTimer();
  if (readyReject) readyReject(err);
  readyResolve = null;
  readyReject = null;

  for (const [id, req] of pending) {
    pending.delete(id);
    clearTimeout(req.timeout);
    req.reject(err);
  }

  workerProcess = null;
  currentModelId = null;
  workerReady = false;
  startPromise = null;
  workerFailed = true;
}

function clearUnloadTimer(): void {
  if (!unloadTimer) return;
  clearTimeout(unloadTimer);
  unloadTimer = null;
}

function scheduleUnload(): void {
  clearUnloadTimer();
  if (!workerProcess) return;
  if (pending.size > 0) return;
  const minutes = getMlxAsrKeepAliveMinutes();
  const delayMs = minutes * 60_000;

  if (delayMs <= 0) {
    stopMlxServer().catch((err: Error) => {
      log.error(`Failed to unload worker: ${err.message}`);
    });
    return;
  }

  unloadTimer = setTimeout(() => {
    if (pending.size > 0) return;
    stopMlxServer().catch((err: Error) => {
      log.error(`Failed to unload idle worker: ${err.message}`);
    });
  }, delayMs);
  unloadTimer.unref?.();
}

export async function stopMlxServer(): Promise<void> {
  if (!workerProcess) return;
  clearUnloadTimer();

  const proc = workerProcess;
  workerProcess = null;
  currentModelId = null;
  workerReady = false;
  startPromise = null;
  workerFailed = false;

  readyReject?.(new Error("mlx-asr worker stopped"));
  readyResolve = null;
  readyReject = null;

  for (const [id, req] of pending) {
    pending.delete(id);
    clearTimeout(req.timeout);
    req.reject(new Error("mlx-asr worker stopped"));
  }

  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };

    const killTimeout = setTimeout(() => {
      try {
        proc.kill(process.platform === "win32" ? undefined : "SIGKILL");
      } catch {
        // ignore
      }
      finish();
    }, 5_000);

    proc.once("close", () => {
      clearTimeout(killTimeout);
      finish();
    });

    try {
      proc.stdin?.write(`${JSON.stringify({ type: "shutdown" })}\n`, () => {
        proc.stdin?.end();
        try {
          proc.kill(process.platform === "win32" ? undefined : "SIGTERM");
        } catch {
          // Process may have already exited after reading the shutdown message.
        }
      });
    } catch {
      clearTimeout(killTimeout);
      finish();
    }
  });
}
