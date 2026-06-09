import type { ActiveAudioPlaybackMode } from "../shared/audio-playback";
import * as linuxAudioDucker from "./linux-audio-ducker";
import * as linuxMediaPlayback from "./linux-media-playback";

export class AudioPlaybackController {
  private paused = false;
  private ducked = false;

  async prepare(mode: ActiveAudioPlaybackMode): Promise<void> {
    if (process.platform !== "linux") return;
    if (this.paused || this.ducked) return;

    const duckPromise = this.duckSafely();
    if (mode === "pause") {
      const [ducked, paused] = await Promise.all([
        duckPromise,
        this.pauseSafely(),
      ]);
      this.ducked = ducked;
      this.paused = paused;
      return;
    }

    this.ducked = await duckPromise;
  }

  async duck(): Promise<void> {
    await this.prepare("duck");
  }

  private async duckSafely(): Promise<boolean> {
    try {
      return await linuxAudioDucker.duckVolume();
    } catch {
      return false;
    }
  }

  private async pauseSafely(): Promise<boolean> {
    try {
      return await linuxMediaPlayback.pausePlayback();
    } catch {
      return false;
    }
  }

  async restore(): Promise<void> {
    if (process.platform !== "linux") return;
    if (!this.paused && !this.ducked) return;

    const shouldResume = this.paused;
    const shouldRestoreDuck = this.ducked;
    this.paused = false;
    this.ducked = false;

    if (shouldRestoreDuck) {
      try {
        await linuxAudioDucker.restoreVolume();
      } catch {
        // Still try to resume media below if Freestyle paused it.
      }
    }

    if (shouldResume) {
      try {
        await linuxMediaPlayback.resumePlayback();
      } catch {
        // A media session may disappear while recording.
      }
    }
  }

  restoreSync(): void {
    if (process.platform !== "linux") return;
    if (!this.paused && !this.ducked) return;

    const shouldResume = this.paused;
    const shouldRestoreDuck = this.ducked;
    this.paused = false;
    this.ducked = false;

    if (shouldRestoreDuck) {
      linuxAudioDucker.restoreVolumeSync();
    }

    if (shouldResume) {
      void linuxMediaPlayback.resumePlayback();
    }
  }
}
