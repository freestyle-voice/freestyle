import { execFile, execFileSync } from "node:child_process";
import { getNativeBinaryPath } from "../native-binary";
import { DUCKED_VOLUME } from "./audio-control-constants";
import type { DeviceVolumeSnapshot } from "./interfaces/device-volume-snapshot.interface";
import type { VolumeDucker } from "./interfaces/volume-ducker.interface";

function execFileText(path: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(path, args, { encoding: "utf8" }, (err, stdout, stderr) => {
      if (err) {
        const detail = typeof stderr === "string" ? stderr.trim() : "";
        reject(new Error(detail || err.message));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

function execFileTextSync(path: string, args: string[]): string {
  return execFileSync(path, args, { encoding: "utf8" }).trim();
}

function parseSnapshot(stdout: string): DeviceVolumeSnapshot<string> {
  const data = JSON.parse(stdout) as {
    deviceId?: unknown;
    volume?: unknown;
  };
  if (typeof data.deviceId !== "string" || typeof data.volume !== "number") {
    throw new Error("Invalid Windows output-volume response");
  }
  return { deviceId: data.deviceId, previousVolume: data.volume };
}

export class WindowsVolumeDucker implements VolumeDucker {
  private snapshot: DeviceVolumeSnapshot<string> | null = null;
  private active = false;

  isActive(): boolean {
    return this.active;
  }

  async duck(): Promise<boolean> {
    if (process.platform !== "win32") return false;
    if (this.active) return true;

    const binaryPath = getNativeBinaryPath("windows-output-volume");
    if (!binaryPath) return false;

    const snapshot = parseSnapshot(await execFileText(binaryPath, ["get"]));
    if (snapshot.previousVolume > DUCKED_VOLUME) {
      await execFileText(binaryPath, [
        "set",
        String(DUCKED_VOLUME),
        snapshot.deviceId,
      ]);
    }

    this.snapshot = snapshot;
    this.active = true;
    return true;
  }

  async restore(): Promise<void> {
    if (process.platform !== "win32") return;
    if (!this.active) return;

    const snapshot = this.snapshot;
    if (!snapshot) {
      this.active = false;
      return;
    }

    const binaryPath = getNativeBinaryPath("windows-output-volume");
    if (!binaryPath) {
      throw new Error("windows-output-volume binary is unavailable");
    }

    try {
      await execFileText(binaryPath, [
        "set",
        String(snapshot.previousVolume),
        snapshot.deviceId,
      ]);
    } catch {
      await execFileText(binaryPath, ["set", String(snapshot.previousVolume)]);
    }

    this.snapshot = null;
    this.active = false;
  }

  snapshotForRecovery(): unknown {
    return this.snapshot;
  }

  async recoverFromSnapshot(raw: unknown): Promise<boolean> {
    if (process.platform !== "win32") return false;
    const snapshot = raw as Partial<DeviceVolumeSnapshot<string>> | null;
    if (
      typeof snapshot?.previousVolume !== "number" ||
      typeof snapshot.deviceId !== "string" ||
      snapshot.previousVolume <= DUCKED_VOLUME
    ) {
      return false;
    }

    const binaryPath = getNativeBinaryPath("windows-output-volume");
    if (!binaryPath) return false;

    const current = parseSnapshot(await execFileText(binaryPath, ["get"]));
    if (current.previousVolume > DUCKED_VOLUME + 0.05) return false;

    try {
      await execFileText(binaryPath, [
        "set",
        String(snapshot.previousVolume),
        snapshot.deviceId,
      ]);
    } catch {
      await execFileText(binaryPath, ["set", String(snapshot.previousVolume)]);
    }
    return true;
  }

  restoreSync(): boolean {
    if (process.platform !== "win32") return true;
    if (!this.active) return true;

    const snapshot = this.snapshot;
    if (!snapshot) {
      this.active = false;
      return true;
    }

    const binaryPath = getNativeBinaryPath("windows-output-volume");
    if (!binaryPath) return false;

    let restored = false;

    try {
      execFileTextSync(binaryPath, [
        "set",
        String(snapshot.previousVolume),
        snapshot.deviceId,
      ]);
      restored = true;
    } catch {
      try {
        execFileTextSync(binaryPath, ["set", String(snapshot.previousVolume)]);
        restored = true;
      } catch {
        // Quit cleanup should never block app shutdown on audio restore failure.
      }
    }

    if (restored) {
      this.snapshot = null;
      this.active = false;
    }
    return restored;
  }
}
