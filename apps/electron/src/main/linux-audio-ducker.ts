/**
 * Lower default output volume while dictating on Linux (PipeWire / PulseAudio).
 */

import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { createAppLogger } from "@freestyle/utils";

const log = createAppLogger("linux-audio-ducker");
const execFileAsync = promisify(execFile);

const CMD_TIMEOUT_MS = 3000;
const DUCKED_VOLUME = 0.15;

type SinkMethod = "wpctl" | "pactl";

interface VolumeSnapshot {
  method: SinkMethod;
  previousVolume: number;
}

let snapshot: VolumeSnapshot | null = null;
let active = false;

async function runCmd(
  command: string,
  args: string[],
): Promise<{ stdout: string; ok: boolean }> {
  try {
    const { stdout } = await execFileAsync(command, args, {
      timeout: CMD_TIMEOUT_MS,
    });
    return { stdout: stdout.trim(), ok: true };
  } catch {
    return { stdout: "", ok: false };
  }
}

function runCmdSync(command: string, args: string[]): string {
  return execFileSync(command, args, {
    encoding: "utf8",
    timeout: CMD_TIMEOUT_MS,
  }).trim();
}

async function commandExists(command: string): Promise<boolean> {
  const { ok } = await runCmd("sh", ["-c", `command -v ${command}`]);
  return ok;
}

function parseWpctlVolume(stdout: string): number | null {
  const match = stdout.match(/Volume:\s*([\d.]+)/);
  if (!match) return null;
  const value = Number.parseFloat(match[1] ?? "");
  return Number.isFinite(value) ? value : null;
}

function parsePactlVolume(stdout: string): number | null {
  const match = stdout.match(/(\d+)%/);
  if (!match) return null;
  const value = Number.parseInt(match[1] ?? "", 10);
  return Number.isFinite(value) ? value : null;
}

async function readVolume(): Promise<VolumeSnapshot | null> {
  if (await commandExists("wpctl")) {
    const { stdout, ok } = await runCmd("wpctl", [
      "get-volume",
      "@DEFAULT_AUDIO_SINK@",
    ]);
    const volume = ok ? parseWpctlVolume(stdout) : null;
    if (volume !== null) {
      return { method: "wpctl", previousVolume: volume };
    }
  }

  if (await commandExists("pactl")) {
    const { stdout, ok } = await runCmd("pactl", [
      "get-sink-volume",
      "@DEFAULT_SINK@",
    ]);
    const volume = ok ? parsePactlVolume(stdout) : null;
    if (volume !== null) {
      return { method: "pactl", previousVolume: volume };
    }
  }

  return null;
}

async function writeVolume(
  method: SinkMethod,
  volume: number,
): Promise<boolean> {
  if (method === "wpctl") {
    const { ok } = await runCmd("wpctl", [
      "set-volume",
      "@DEFAULT_AUDIO_SINK@",
      String(volume),
    ]);
    return ok;
  }

  const { ok } = await runCmd("pactl", [
    "set-sink-volume",
    "@DEFAULT_SINK@",
    `${Math.round(volume)}%`,
  ]);
  return ok;
}

function writeVolumeSync(method: SinkMethod, volume: number): void {
  if (method === "wpctl") {
    runCmdSync("wpctl", [
      "set-volume",
      "@DEFAULT_AUDIO_SINK@",
      String(volume),
    ]);
    return;
  }

  runCmdSync("pactl", [
    "set-sink-volume",
    "@DEFAULT_SINK@",
    `${Math.round(volume)}%`,
  ]);
}

function targetDuckedVolume(current: VolumeSnapshot): number {
  if (current.method === "wpctl") {
    return Math.min(current.previousVolume, DUCKED_VOLUME);
  }
  const duckedPercent = Math.round(DUCKED_VOLUME * 100);
  return Math.min(current.previousVolume, duckedPercent);
}

export async function duckVolume(): Promise<boolean> {
  if (process.platform !== "linux") return false;
  if (active) return true;

  const current = await readVolume();
  if (!current) {
    log.warn("duck_volume failed: no wpctl or pactl sink volume available");
    return false;
  }

  const ducked = targetDuckedVolume(current);
  if (ducked < current.previousVolume) {
    const ok = await writeVolume(current.method, ducked);
    if (!ok) return false;
  }

  snapshot = current;
  active = true;
  log.info(
    `Ducked sink volume ${current.previousVolume} -> ${ducked} (${current.method})`,
  );
  return true;
}

export async function restoreVolume(): Promise<void> {
  if (process.platform !== "linux") return;
  if (!active) return;

  const current = snapshot;
  snapshot = null;
  active = false;
  if (!current) return;

  try {
    await writeVolume(current.method, current.previousVolume);
    log.info(
      `Restored sink volume to ${current.previousVolume} (${current.method})`,
    );
  } catch {
    log.warn("restore_volume failed");
  }
}

export function restoreVolumeSync(): void {
  if (process.platform !== "linux") return;
  if (!active) return;

  const current = snapshot;
  snapshot = null;
  active = false;
  if (!current) return;

  try {
    writeVolumeSync(current.method, current.previousVolume);
  } catch {
    // Quit cleanup should never block app shutdown on audio restore failure.
  }
}

export function isDuckActive(): boolean {
  return active;
}
