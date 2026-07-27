/**
 * Microphone capture for streaming dictation. Wraps `expo-audio`'s
 * `useAudioStream` to deliver conditioned mono 16 kHz PCM16LE frames plus a
 * running input level for the waveform, and exposes permission helpers.
 */

import {
  AudioModule,
  type AudioStreamBuffer,
  setAudioModeAsync,
  useAudioStream,
} from "expo-audio";
import { useCallback, useEffect, useRef } from "react";

import { TARGET_SAMPLE_RATE, toCloudFrame } from "./resample";

export type MicPermission = "granted" | "denied" | "undetermined";

export async function checkMicPermission(): Promise<MicPermission> {
  const { status } = await AudioModule.getRecordingPermissionsAsync();
  return status === "granted"
    ? "granted"
    : status === "denied"
      ? "denied"
      : "undetermined";
}

export async function requestMicPermission(): Promise<MicPermission> {
  const { status } = await AudioModule.requestRecordingPermissionsAsync();
  return status === "granted"
    ? "granted"
    : status === "denied"
      ? "denied"
      : "undetermined";
}

/** Configure the audio session for recording. Call before starting a stream. */
async function enableRecordingMode(): Promise<void> {
  await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
}

export interface RecorderCallbacks {
  /** A conditioned mono 16 kHz PCM16LE frame ready to stream. */
  onFrame: (frame: ArrayBuffer) => void;
  /** Normalized input level in [0, 1] for the waveform. */
  onLevel?: (level: number) => void;
}

/**
 * Perceived loudness of an Int16 buffer, normalized to ~[0, 1].
 *
 * Uses RMS (energy) rather than peak: peak spikes on the loudest single sample
 * and jitters wildly, whereas RMS tracks how loud the frame actually *sounds*,
 * which is what the visualizer should depict. The RMS of typical speech is well
 * below full-scale, so we apply a gain and a mild curve so normal talking fills
 * a satisfying portion of the meter without clipping on peaks.
 */
function rmsLevel(data: ArrayBuffer): number {
  const samples = new Int16Array(data);
  if (samples.length === 0) return 0;
  // Sample sparsely — a coarse level is all the visualizer needs.
  const step = Math.max(1, Math.floor(samples.length / 512));
  let sumSquares = 0;
  let count = 0;
  for (let i = 0; i < samples.length; i += step) {
    const s = samples[i] / 32_768;
    sumSquares += s * s;
    count++;
  }
  const rms = Math.sqrt(sumSquares / Math.max(1, count));
  // Gain so conversational speech (~0.05–0.15 RMS) reaches a lively level, and
  // a gentle sqrt curve to lift quiet passages while still leaving headroom.
  return Math.min(1, Math.sqrt(rms * 3.2));
}

export interface Recorder {
  start: () => Promise<void>;
  stop: () => void;
}

/**
 * Hook returning a recorder that streams conditioned PCM frames to the given
 * callbacks. Requests a mono 16 kHz Int16 stream; the hardware may deliver a
 * different rate, so each frame is downmixed/resampled before delivery.
 */
export function useRecorder(callbacks: RecorderCallbacks): Recorder {
  const cb = useRef(callbacks);
  useEffect(() => {
    cb.current = callbacks;
  });

  const handleBuffer = useCallback((buffer: AudioStreamBuffer) => {
    const frame = toCloudFrame(buffer.data, buffer.sampleRate, buffer.channels);
    if (frame) cb.current.onFrame(frame);
    cb.current.onLevel?.(rmsLevel(buffer.data));
  }, []);

  const { stream } = useAudioStream({
    sampleRate: TARGET_SAMPLE_RATE,
    channels: 1,
    encoding: "int16",
    onBuffer: handleBuffer,
  });

  const start = useCallback(async () => {
    await enableRecordingMode();
    await stream.start();
  }, [stream]);

  const stop = useCallback(() => {
    stream.stop();
  }, [stream]);

  return { start, stop };
}
