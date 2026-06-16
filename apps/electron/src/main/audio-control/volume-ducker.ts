import type { VolumeDucker } from "./interfaces/volume-ducker.interface";
import { LinuxVolumeDucker } from "./linux-audio-ducker";
import { MacosVolumeDucker } from "./macos-audio-ducker";
import { WindowsVolumeDucker } from "./windows-audio-ducker";

const duckers: Partial<Record<NodeJS.Platform, VolumeDucker>> = {
  darwin: new MacosVolumeDucker(),
  linux: new LinuxVolumeDucker(),
  win32: new WindowsVolumeDucker(),
};

function currentDucker(): VolumeDucker | null {
  return duckers[process.platform] ?? null;
}

export async function duckVolume(): Promise<boolean> {
  return (await currentDucker()?.duck()) ?? false;
}

export async function restoreVolume(): Promise<void> {
  await currentDucker()?.restore();
}

export function restoreVolumeSync(): boolean {
  return currentDucker()?.restoreSync() ?? true;
}
