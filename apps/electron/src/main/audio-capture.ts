/**
 * Native audio capture using RtAudio (via audify).
 *
 * Runs in the Electron main process.  Captures PCM16 mono audio at 16 kHz
 * and forwards binary frames to a provided callback.  Exposes start/stop
 * with ~10 ms latency and proper OS mic-indicator lifecycle.
 *
 * Usage:
 *   const capture = new AudioCapture();
 *   capture.openStream();                       // pre-warm the device
 *   capture.start((pcm16: Buffer) => { … });    // begin capturing
 *   capture.stop();                             // stop, mic indicator off
 *   capture.destroy();                          // release all resources
 */

import { RtAudio } from "audify";

const SAMPLE_RATE = 16_000;
const CHANNELS = 1;
const FRAME_SIZE = 1280; // 80 ms at 16 kHz
// RtAudioFormat.RTAUDIO_SINT16 = 0x2 — can't reference const enum with isolatedModules
const RTAUDIO_SINT16 = 0x2;

export class AudioCapture {
  private rtAudio: RtAudio;
  private opened = false;
  private running = false;
  private onData: ((pcm16: Buffer) => void) | null = null;

  constructor() {
    this.rtAudio = new RtAudio();
  }

  /** List available input devices. */
  getDevices(): { id: number; name: string; isDefault: boolean }[] {
    const devices = this.rtAudio.getDevices();
    const defaultId = this.rtAudio.getDefaultInputDevice();
    return devices
      .filter((d) => d.inputChannels > 0)
      .map((d, i) => ({
        id: i,
        name: d.name,
        isDefault: i === defaultId,
      }));
  }

  /** Pre-warm the audio device without starting capture. */
  openStream(deviceId?: number): void {
    if (this.opened) return;

    const inputDeviceId = deviceId ?? this.rtAudio.getDefaultInputDevice();

    this.rtAudio.openStream(
      null, // no output
      {
        deviceId: inputDeviceId,
        nChannels: CHANNELS,
        firstChannel: 0,
      },
      RTAUDIO_SINT16,
      SAMPLE_RATE,
      FRAME_SIZE,
      "freestyle",
      (pcm) => {
        if (this.onData) {
          this.onData(pcm as Buffer);
        }
      },
      null, // no frame output callback
    );
    this.opened = true;
  }

  /** Begin capturing audio.  Calls `cb` with PCM16 buffers. */
  start(cb: (pcm16: Buffer) => void): void {
    if (!this.opened) this.openStream();
    this.onData = cb;
    if (!this.running) {
      this.rtAudio.start();
      this.running = true;
    }
  }

  /** Stop capturing.  The device handle stays open for fast restart. */
  stop(): void {
    if (this.running) {
      this.rtAudio.stop();
      this.running = false;
    }
    this.onData = null;
  }

  /** Compute RMS volume (0..1) from a PCM16 buffer. */
  static volume(pcm16: Buffer): number {
    const samples = pcm16.length / 2;
    if (samples === 0) return 0;
    let sum = 0;
    for (let i = 0; i < pcm16.length; i += 2) {
      const s = pcm16.readInt16LE(i) / 32768;
      sum += s * s;
    }
    return Math.min(1, Math.sqrt(sum / samples) * 3);
  }

  /** Release all resources. */
  destroy(): void {
    this.stop();
    if (this.opened) {
      try {
        this.rtAudio.closeStream();
      } catch {}
      this.opened = false;
    }
  }
}
