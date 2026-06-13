import type { ActiveAudioPlaybackMode } from "../shared/audio-playback";
import { AudioDucker } from "./audio-ducker";
import { AudioPauser } from "./audio-pauser";
import * as linuxAudioDucker from "./linux-audio-ducker";
import * as linuxMediaPlayback from "./linux-media-playback";

export class AudioPlaybackController {
  private readonly ducker = new AudioDucker();
  private readonly pauser = new AudioPauser();
  private paused = false;
  private ducked = false;

  private supportsBackgroundAudio(): boolean {
    return process.platform === "darwin" || process.platform === "linux";
  }

  async prepare(mode: ActiveAudioPlaybackMode): Promise<void> {
    if (!this.supportsBackgroundAudio()) return;
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
      if (process.platform === "darwin") {
        return await this.ducker.duck();
      }
      if (process.platform === "linux") {
        return await linuxAudioDucker.duckVolume();
      }
      return false;
    } catch {
      return false;
    }
  }

  private async pauseSafely(): Promise<boolean> {
    try {
      if (process.platform === "darwin") {
        return await this.pauser.pause();
      }
      if (process.platform === "linux") {
        return await linuxMediaPlayback.pausePlayback();
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
    this.paused = false;
    this.ducked = false;

    if (shouldRestoreDuck) {
      try {
        if (process.platform === "darwin") {
          await this.ducker.restore();
        } else if (process.platform === "linux") {
          await linuxAudioDucker.restoreVolume();
        }
      } catch {
        // Still try to resume media below if Freestyle paused it.
      }
    }

    if (shouldResume) {
      try {
        if (process.platform === "darwin") {
          await this.pauser.restore();
        } else if (process.platform === "linux") {
          await linuxMediaPlayback.resumePlayback();
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
    this.paused = false;
    this.ducked = false;

    if (shouldRestoreDuck) {
      if (process.platform === "darwin") {
        this.ducker.restoreSync();
      } else if (process.platform === "linux") {
        linuxAudioDucker.restoreVolumeSync();
      }
    }

    if (shouldResume) {
      if (process.platform === "darwin") {
        this.pauser.restoreSync();
      } else if (process.platform === "linux") {
        void linuxMediaPlayback.resumePlayback();
      }
    }
  }
}
