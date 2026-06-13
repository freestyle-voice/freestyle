export function createPcmUpsampler(
  fromRate: number,
  toRate: number,
): (chunk: ArrayBuffer) => ArrayBuffer {
  if (fromRate === toRate) return (chunk) => chunk;
  const step = fromRate / toRate;
  let prev = 0;
  let hasPrev = false;
  let pos = 0;

  return (chunk) => {
    const input = new Int16Array(chunk);
    if (input.length === 0) return new ArrayBuffer(0);

    const offset = hasPrev ? 1 : 0;
    const total = input.length + offset;
    const sampleAt = (i: number): number =>
      i < offset ? prev : input[i - offset];

    const count = Math.max(0, Math.floor((total - 1 - pos) / step) + 1);
    const out = new Int16Array(count);
    for (let k = 0; k < count; k++) {
      const i = Math.floor(pos);
      const frac = pos - i;
      const a = sampleAt(i);
      const b = i + 1 < total ? sampleAt(i + 1) : a;
      out[k] = Math.round(a + (b - a) * frac);
      pos += step;
    }

    prev = input[input.length - 1];
    hasPrev = true;
    pos -= total - 1;
    return out.buffer;
  };
}
