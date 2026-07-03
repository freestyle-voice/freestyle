import type { ActiveAudioPlaybackMode } from "../../shared/audio-playback";
import * as linuxMediaPlayback from "./linux-media-playback";
import { MacosMediaPlayback } from "./macos-media-playback";
import * as volumeDucker from "./volume-ducker";
import * as windowsMediaPlayback from "./windows-media-playback";

export class AudioPlaybackController {
  private readonly macosMediaPlayback = new MacosMediaPlayback();
  private paused = false;
  private ducked = false;

  private supportsBackgroundAudio(): boolean {
    return (
      process.platform === "darwin" ||
      process.platform === "linux" ||
      process.platform === "win32"
    );
  }

  async prepare(mode: ActiveAudioPlaybackMode): Promise<void> {
    if (!this.supportsBackgroundAudio()) return;

    const shouldDuck = !this.ducked;
    const shouldPause = mode === "pause" && !this.paused;
    if (!shouldDuck && !shouldPause) return;

    const duckPromise = shouldDuck
      ? this.duckSafely()
      : Promise.resolve(this.ducked);
    if (mode === "pause") {
      const [ducked, paused] = await Promise.all([
        duckPromise,
        shouldPause ? this.pauseSafely() : Promise.resolve(this.paused),
      ]);
      this.ducked = this.ducked || ducked;
      this.paused = this.paused || paused;
      return;
    }

    this.ducked = this.ducked || (await duckPromise);
  }

  async duck(): Promise<void> {
    await this.prepare("duck");
  }

  private async duckSafely(): Promise<boolean> {
    try {
      return await volumeDucker.duckVolume();
    } catch {
      return false;
    }
  }

  private async pauseSafely(): Promise<boolean> {
    try {
      if (process.platform === "darwin") {
        return await this.macosMediaPlayback.pausePlayback();
      }
      if (process.platform === "linux") {
        return await linuxMediaPlayback.pausePlayback();
      }
      if (process.platform === "win32") {
        return await windowsMediaPlayback.pausePlayback();
      }
      return false;
    } catch {
      return false;
    }
  }

  async restore(): Promise<void> {
    if (!this.supportsBackgroundAudio()) return;
    if (!this.paused && !this.ducked) return;

    const shouldResume = this.paused;
    const shouldRestoreDuck = this.ducked;

    if (shouldRestoreDuck) {
      try {
        await volumeDucker.restoreVolume();
        this.ducked = false;
      } catch {
        // Still try to resume media below if Freestyle paused it.
      }
    }

    if (shouldResume) {
      this.paused = false;
      try {
        if (process.platform === "darwin") {
          await this.macosMediaPlayback.restore();
        } else if (process.platform === "linux") {
          await linuxMediaPlayback.resumePlayback();
        } else if (process.platform === "win32") {
          await windowsMediaPlayback.resumePlayback();
        }
      } catch {
        // A media session may disappear while recording.
      }
    }
  }

  restoreSync(): void {
    if (!this.supportsBackgroundAudio()) return;
    if (!this.paused && !this.ducked) return;

    const shouldResume = this.paused;
    const shouldRestoreDuck = this.ducked;

    if (shouldRestoreDuck) {
      this.ducked = !volumeDucker.restoreVolumeSync();
    }

    if (shouldResume) {
      this.paused = false;
      if (process.platform === "darwin") {
        this.macosMediaPlayback.restoreSync();
      } else if (process.platform === "linux") {
        linuxMediaPlayback.resumePlaybackSync();
      } else if (process.platform === "win32") {
        windowsMediaPlayback.resumePlaybackSync();
      }
    }
  }
}
