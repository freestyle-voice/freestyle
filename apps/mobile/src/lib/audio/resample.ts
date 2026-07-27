/**
 * PCM16 audio conditioning for the cloud STT upstream.
 *
 * `expo-audio`'s `useAudioStream` delivers interleaved little-endian Int16
 * PCM at whatever rate the hardware provides (often 48 kHz on iOS), possibly
 * multi-channel. Soniox (via Freestyle Cloud) requires mono 16 kHz. We
 * downmix to mono and linearly resample to 16 kHz in JS — cheap and adequate
 * for speech.
 */

export const TARGET_SAMPLE_RATE = 16_000;

/** Average interleaved channels down to a single mono Int16 track. */
function downmixToMono(input: Int16Array, channels: number): Int16Array {
  if (channels <= 1) return input;
  const frames = Math.floor(input.length / channels);
  const mono = new Int16Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) sum += input[i * channels + c];
    mono[i] = Math.round(sum / channels);
  }
  return mono;
}

/** Linear-interpolation resample of a mono Int16 track to {@link TARGET_SAMPLE_RATE}. */
function resampleMono(input: Int16Array, inputRate: number): Int16Array {
  if (inputRate === TARGET_SAMPLE_RATE) return input;
  const ratio = TARGET_SAMPLE_RATE / inputRate;
  const outLength = Math.max(1, Math.floor(input.length * ratio));
  const out = new Int16Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const srcPos = i / ratio;
    const idx = Math.floor(srcPos);
    const frac = srcPos - idx;
    const a = input[idx] ?? 0;
    const b = input[idx + 1] ?? a;
    out[i] = Math.round(a + (b - a) * frac);
  }
  return out;
}

/**
 * Convert one captured buffer into a mono 16 kHz PCM16LE `ArrayBuffer` ready to
 * send over the WebSocket. Returns null when there is nothing to send.
 */
export function toCloudFrame(
  data: ArrayBuffer,
  sampleRate: number,
  channels: number,
): ArrayBuffer | null {
  if (data.byteLength < 2) return null;
  const samples = new Int16Array(data);
  const mono = downmixToMono(samples, channels);
  const resampled = resampleMono(mono, sampleRate);
  // Copy into a fresh, tightly-sized ArrayBuffer so we never ship a padded
  // buffer and the result is always a plain (non-shared) ArrayBuffer.
  const out = new Int16Array(resampled.length);
  out.set(resampled);
  return out.buffer;
}
