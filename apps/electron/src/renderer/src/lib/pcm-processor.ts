/**
 * AudioWorklet processor that buffers, downsamples and encodes audio
 * to 16 kHz PCM16 chunks ready to send over the wire.
 *
 * Uses the AudioWorkletGlobalScope `sampleRate` to compute the
 * downsampling ratio.  Posts ~80 ms Int16Array buffers as transferables.
 */

const PROCESSOR_CODE = `
const TARGET_RATE = 16000;
const TARGET_CHUNK_MS = 80;

class PCMProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ratio = sampleRate / TARGET_RATE;
    this.targetChunkSamples = (TARGET_RATE * TARGET_CHUNK_MS) / 1000;
    this.samplesNeeded = Math.ceil(this.targetChunkSamples * this.ratio);
    // Pre-allocated ring buffer — sized for ~200ms of audio at the native
    // sample rate, which is well above the ~80ms flush interval.
    this.ringLen = this.samplesNeeded * 4;
    this.ring = new Float32Array(this.ringLen);
    this.writePos = 0;
    this.available = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) return true;

    const raw = input[0];
    const len = raw.length;

    // Write incoming samples into the ring buffer
    for (let i = 0; i < len; i++) {
      this.ring[this.writePos] = raw[i];
      this.writePos = (this.writePos + 1) % this.ringLen;
    }
    this.available += len;

    // Flush when we have enough for one target chunk
    while (this.available >= this.samplesNeeded) {
      const readPos = (this.writePos - this.available + this.ringLen) % this.ringLen;
      const outLen = Math.round(this.samplesNeeded / this.ratio);
      const pcm16 = new Int16Array(outLen);
      for (let i = 0; i < outLen; i++) {
        const srcIdx = Math.round(i * this.ratio);
        const ringIdx = (readPos + srcIdx) % this.ringLen;
        const s = Math.max(-1, Math.min(1, this.ring[ringIdx] || 0));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      this.available -= this.samplesNeeded;
      this.port.postMessage(pcm16.buffer, [pcm16.buffer]);
    }

    return true;
  }
}
registerProcessor('pcm-processor', PCMProcessor);
`;

let blobUrl: string | null = null;

export function getPCMProcessorUrl(): string {
  if (!blobUrl) {
    const blob = new Blob([PROCESSOR_CODE], { type: "application/javascript" });
    blobUrl = URL.createObjectURL(blob);
  }
  return blobUrl;
}
