/**
 * Decode an arbitrary audio file (wav, mp3, m4a, …) into 16 kHz mono 16-bit PCM
 * WAV — the format Freestyle's transcription providers expect. Uses the
 * browser's Web Audio API, which is available in the plugin page.
 */

const TARGET_RATE = 16000;
const HEADER_SIZE = 44;

export async function toWav16k(file: File): Promise<Blob> {
  const arrayBuf = await file.arrayBuffer();
  const audioCtx = new AudioContext();
  let decoded: AudioBuffer;
  try {
    decoded = await audioCtx.decodeAudioData(arrayBuf.slice(0));
  } finally {
    void audioCtx.close();
  }

  const mono = mixToMono(decoded);
  const resampled = await resample(mono, decoded.sampleRate, TARGET_RATE);
  return new Blob([encodeWav(resampled, TARGET_RATE)], { type: "audio/wav" });
}

function mixToMono(buf: AudioBuffer): Float32Array {
  if (buf.numberOfChannels === 1) return buf.getChannelData(0);
  const len = buf.length;
  const out = new Float32Array(len);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) out[i] += data[i] / buf.numberOfChannels;
  }
  return out;
}

async function resample(
  data: Float32Array,
  fromRate: number,
  toRate: number,
): Promise<Float32Array> {
  if (fromRate === toRate) return data;
  const outLen = Math.round((data.length * toRate) / fromRate);
  const offline = new OfflineAudioContext(1, outLen, toRate);
  const src = offline.createBuffer(1, data.length, fromRate);
  src.getChannelData(0).set(data);
  const node = offline.createBufferSource();
  node.buffer = src;
  node.connect(offline.destination);
  node.start(0);
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0);
}

function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const dataSize = samples.length * 2;
  const buf = new ArrayBuffer(HEADER_SIZE + dataSize);
  const view = new DataView(buf);

  writeStr(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeStr(view, 8, "WAVE");
  writeStr(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true); // bits per sample
  writeStr(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = HEADER_SIZE;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buf;
}

function writeStr(view: DataView, offset: number, s: string): void {
  for (let i = 0; i < s.length; i++) {
    view.setUint8(offset + i, s.charCodeAt(i));
  }
}
