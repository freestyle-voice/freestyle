import type { ActiveAudioPlaybackMode } from "../shared/audio-playback";
import { AudioDucker } from "./audio-ducker";
import { AudioPauser } from "./audio-pauser";

export class AudioPlaybackController {
  private readonly ducker = new AudioDucker();
  private readonly pauser = new AudioPauser();
  private paused = false;
  private ducked = false;

  async prepare(mode: ActiveAudioPlaybackMode): Promise<void> {
    if (process.platform !== "darwin") return;
    if (this.paused || this.ducked) return;

    const duckPromise = this.duckSafely();
    if (mode === "pause") {
      const [ducked, paused] = await Promise.all([
        duckPromise,
        this.pauser.pause(),
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
      return await this.ducker.duck();
    } catch {
      return false;
    }
  }

  async restore(): Promise<void> {
    if (process.platform !== "darwin") return;
    if (!this.paused && !this.ducked) return;

    const shouldResume = this.paused;
    const shouldRestoreDuck = this.ducked;
    this.paused = false;
    this.ducked = false;

    if (shouldRestoreDuck) {
      try {
        await this.ducker.restore();
      } catch {
        // Still try to resume media below if Freestyle paused it.
      }
    }

    if (shouldResume) {
      await this.pauser.restore();
    }
  }

  restoreSync(): void {
    if (process.platform !== "darwin") return;
    if (!this.paused && !this.ducked) return;

    const shouldResume = this.paused;
    const shouldRestoreDuck = this.ducked;
    this.paused = false;
    this.ducked = false;

    if (shouldRestoreDuck) {
      this.ducker.restoreSync();
    }

    if (shouldResume) {
      this.pauser.restoreSync();
    }
  }
}
