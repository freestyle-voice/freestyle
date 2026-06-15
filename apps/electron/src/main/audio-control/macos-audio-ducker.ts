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

function parseSnapshot(stdout: string): DeviceVolumeSnapshot<number> {
  const data = JSON.parse(stdout) as {
    deviceId?: unknown;
    volume?: unknown;
  };
  if (typeof data.deviceId !== "number" || typeof data.volume !== "number") {
    throw new Error("Invalid macOS output-volume response");
  }
  return { deviceId: data.deviceId, previousVolume: data.volume };
}

export class MacosVolumeDucker implements VolumeDucker {
  private snapshot: DeviceVolumeSnapshot<number> | null = null;
  private active = false;

  isActive(): boolean {
    return this.active;
  }

  async duck(): Promise<boolean> {
    if (process.platform !== "darwin") return false;
    if (this.active) return true;

    const binaryPath = getNativeBinaryPath("macos-output-volume");
    if (!binaryPath) return false;

    const snapshot = parseSnapshot(await execFileText(binaryPath, ["get"]));
    if (snapshot.previousVolume > DUCKED_VOLUME) {
      await execFileText(binaryPath, [
        "set",
        String(DUCKED_VOLUME),
        String(snapshot.deviceId),
      ]);
    }

    this.snapshot = snapshot;
    this.active = true;
    return true;
  }

  async restore(): Promise<void> {
    if (process.platform !== "darwin") return;
    if (!this.active) return;

    const snapshot = this.snapshot;
    this.snapshot = null;
    this.active = false;
    if (!snapshot) return;

    const binaryPath = getNativeBinaryPath("macos-output-volume");
    if (!binaryPath) return;

    try {
      await execFileText(binaryPath, [
        "set",
        String(snapshot.previousVolume),
        String(snapshot.deviceId),
      ]);
    } catch {
      await execFileText(binaryPath, ["set", String(snapshot.previousVolume)]);
    }
  }

  restoreSync(): void {
    if (process.platform !== "darwin") return;
    if (!this.active) return;

    const snapshot = this.snapshot;
    this.snapshot = null;
    this.active = false;
    if (!snapshot) return;

    const binaryPath = getNativeBinaryPath("macos-output-volume");
    if (!binaryPath) return;

    try {
      execFileTextSync(binaryPath, [
        "set",
        String(snapshot.previousVolume),
        String(snapshot.deviceId),
      ]);
    } catch {
      try {
        execFileTextSync(binaryPath, ["set", String(snapshot.previousVolume)]);
      } catch {
        // Quit cleanup should never block app shutdown on audio restore failure.
      }
    }
  }
}
