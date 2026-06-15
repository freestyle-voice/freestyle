/**
 * Lower default output volume while dictating on Linux (PipeWire / PulseAudio).
 */

import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { createAppLogger } from "@freestyle/utils";
import {
  AUDIO_CONTROL_CMD_TIMEOUT_MS,
  DUCKED_VOLUME,
} from "./audio-control-constants";
import type { VolumeDucker } from "./interfaces/volume-ducker.interface";

const log = createAppLogger("linux-audio-ducker");
const execFileAsync = promisify(execFile);

type SinkMethod = "wpctl" | "pactl";

interface SinkVolumeSnapshot {
  method: SinkMethod;
  previousVolume: number;
}

async function runCmd(
  command: string,
  args: string[],
): Promise<{ stdout: string; ok: boolean }> {
  try {
    const { stdout } = await execFileAsync(command, args, {
      timeout: AUDIO_CONTROL_CMD_TIMEOUT_MS,
    });
    return { stdout: stdout.trim(), ok: true };
  } catch {
    return { stdout: "", ok: false };
  }
}

function runCmdSync(command: string, args: string[]): string {
  return execFileSync(command, args, {
    encoding: "utf8",
    timeout: AUDIO_CONTROL_CMD_TIMEOUT_MS,
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

async function readVolume(): Promise<SinkVolumeSnapshot | null> {
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
    runCmdSync("wpctl", ["set-volume", "@DEFAULT_AUDIO_SINK@", String(volume)]);
    return;
  }

  runCmdSync("pactl", [
    "set-sink-volume",
    "@DEFAULT_SINK@",
    `${Math.round(volume)}%`,
  ]);
}

function targetDuckedVolume(current: SinkVolumeSnapshot): number {
  if (current.method === "wpctl") {
    return Math.min(current.previousVolume, DUCKED_VOLUME);
  }
  const duckedPercent = Math.round(DUCKED_VOLUME * 100);
  return Math.min(current.previousVolume, duckedPercent);
}

export class LinuxVolumeDucker implements VolumeDucker {
  private snapshot: SinkVolumeSnapshot | null = null;
  private active = false;

  isActive(): boolean {
    return this.active;
  }

  async duck(): Promise<boolean> {
    if (process.platform !== "linux") return false;
    if (this.active) return true;

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

    this.snapshot = current;
    this.active = true;
    log.info(
      `Ducked sink volume ${current.previousVolume} -> ${ducked} (${current.method})`,
    );
    return true;
  }

  async restore(): Promise<void> {
    if (process.platform !== "linux") return;
    if (!this.active) return;

    const current = this.snapshot;
    this.snapshot = null;
    this.active = false;
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

  restoreSync(): void {
    if (process.platform !== "linux") return;
    if (!this.active) return;

    const current = this.snapshot;
    this.snapshot = null;
    this.active = false;
    if (!current) return;

    try {
      writeVolumeSync(current.method, current.previousVolume);
    } catch {
      // Quit cleanup should never block app shutdown on audio restore failure.
    }
  }
}
