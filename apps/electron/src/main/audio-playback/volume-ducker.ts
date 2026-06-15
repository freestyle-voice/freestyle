import * as linuxAudioDucker from "./linux-audio-ducker";
import { MacosAudioDucker } from "./macos-audio-ducker";
import { WindowsAudioDucker } from "./windows-audio-ducker";

const macosDucker = new MacosAudioDucker();
const windowsDucker = new WindowsAudioDucker();

export async function duckVolume(): Promise<boolean> {
  if (process.platform === "darwin") {
    return await macosDucker.duckVolume();
  }
  if (process.platform === "linux") {
    return await linuxAudioDucker.duckVolume();
  }
  if (process.platform === "win32") {
    return await windowsDucker.duckVolume();
  }
  return false;
}

export async function restoreVolume(): Promise<void> {
  if (process.platform === "darwin") {
    await macosDucker.restore();
  } else if (process.platform === "linux") {
    await linuxAudioDucker.restoreVolume();
  } else if (process.platform === "win32") {
    await windowsDucker.restore();
  }
}

export function restoreVolumeSync(): void {
  if (process.platform === "darwin") {
    macosDucker.restoreSync();
  } else if (process.platform === "linux") {
    linuxAudioDucker.restoreVolumeSync();
  } else if (process.platform === "win32") {
    windowsDucker.restoreSync();
  }
}
