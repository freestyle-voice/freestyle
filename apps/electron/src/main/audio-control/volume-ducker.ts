import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createAppLogger } from "@freestyle-voice/utils";
import { app } from "electron";
import type { VolumeDucker } from "./interfaces/volume-ducker.interface";
import { LinuxVolumeDucker } from "./linux-audio-ducker";
import { MacosVolumeDucker } from "./macos-audio-ducker";
import { WindowsVolumeDucker } from "./windows-audio-ducker";

const log = createAppLogger("volume-ducker");

const duckers: Partial<Record<NodeJS.Platform, VolumeDucker>> = {
  darwin: new MacosVolumeDucker(),
  linux: new LinuxVolumeDucker(),
  win32: new WindowsVolumeDucker(),
};

function currentDucker(): VolumeDucker | null {
  return duckers[process.platform] ?? null;
}

// If the app dies while ducked (crash, SIGKILL, power loss), the in-memory
// pre-duck snapshot is lost and the user's system volume stays stuck at the
// ducked level. Persist the snapshot around each duck so the next launch can
// recover it.
function recoveryFilePath(): string {
  return join(app.getPath("userData"), "duck-recovery.json");
}

function persistRecoverySnapshot(snapshot: unknown): void {
  if (snapshot == null) return;
  try {
    writeFileSync(
      recoveryFilePath(),
      JSON.stringify({ platform: process.platform, snapshot }),
      "utf8",
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn(`Failed to persist duck recovery snapshot: ${message}`);
  }
}

function clearRecoverySnapshot(): void {
  try {
    unlinkSync(recoveryFilePath());
  } catch {
    // Already gone
  }
}

export async function duckVolume(): Promise<boolean> {
  const ducker = currentDucker();
  if (!ducker) return false;
  const ducked = await ducker.duck();
  if (ducked) persistRecoverySnapshot(ducker.snapshotForRecovery());
  return ducked;
}

export async function restoreVolume(): Promise<void> {
  await currentDucker()?.restore();
  clearRecoverySnapshot();
}

export function restoreVolumeSync(): boolean {
  const restored = currentDucker()?.restoreSync() ?? true;
  if (restored) clearRecoverySnapshot();
  return restored;
}

/**
 * Restore volume left ducked by a previous run that died mid-dictation.
 * Call once at startup. No-op when the previous run exited cleanly.
 */
export async function recoverDuckedVolumeFromCrash(): Promise<void> {
  let state: { platform?: string; snapshot?: unknown };
  try {
    state = JSON.parse(readFileSync(recoveryFilePath(), "utf8"));
  } catch {
    return; // No recovery file — the previous run exited cleanly.
  }

  // Clear before restoring so a failing restore can't repeat every launch.
  clearRecoverySnapshot();
  if (state?.platform !== process.platform) return;

  const ducker = currentDucker();
  if (!ducker) return;

  try {
    if (await ducker.recoverFromSnapshot(state.snapshot)) {
      log.info("Restored system volume left ducked by a previous session");
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.warn(`Duck recovery failed: ${message}`);
  }
}
