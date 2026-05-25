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
    // sampleRate is a global in AudioWorkletGlobalScope
    this.ratio = sampleRate / TARGET_RATE;
    this.targetChunkSamples = (TARGET_RATE * TARGET_CHUNK_MS) / 1000;
    this.buf = new Float32Array(0);
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) return true;

    const raw = input[0];

    // Append to internal buffer
    const prev = this.buf;
    const next = new Float32Array(prev.length + raw.length);
    next.set(prev);
    next.set(raw, prev.length);
    this.buf = next;

    // Flush when we have enough for one target chunk
    const samplesNeeded = Math.ceil(this.targetChunkSamples * this.ratio);
    while (this.buf.length >= samplesNeeded) {
      const slice = this.buf.subarray(0, samplesNeeded);
      this.buf = this.buf.slice(samplesNeeded);

      // Downsample + encode to PCM16
      const outLen = Math.round(slice.length / this.ratio);
      const pcm16 = new Int16Array(outLen);
      for (let i = 0; i < outLen; i++) {
        const idx = Math.round(i * this.ratio);
        const s = Math.max(-1, Math.min(1, slice[idx] || 0));
        pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }

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
