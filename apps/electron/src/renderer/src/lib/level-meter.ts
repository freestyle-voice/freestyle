const VOICE_MIN_HZ = 80;
const VOICE_MAX_HZ = 4000;
const FFT_SIZE = 1024;
const ANALYSER_SMOOTHING = 0.15;
const LEVEL_RISE = 0.8;
const LEVEL_FALL = 0.35;

export class LevelMeter {
  private ctx: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private data: Uint8Array<ArrayBuffer> | null = null;
  private band = { start: 0, end: 0, divisor: 1 };
  private frame: number | null = null;
  private level = 0;

  constructor(private readonly onLevel: (level: number) => void) {}

  attach(stream: MediaStream): void {
    this.detach();
    try {
      if (!this.ctx || this.ctx.state === "closed")
        this.ctx = new AudioContext();
      const ctx = this.ctx;
      if (ctx.state === "suspended") void ctx.resume();

      const analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = ANALYSER_SMOOTHING;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);

      const binWidth = ctx.sampleRate / FFT_SIZE;
      const start = Math.max(0, Math.floor(VOICE_MIN_HZ / binWidth));
      const end = Math.min(
        analyser.frequencyBinCount,
        Math.ceil(VOICE_MAX_HZ / binWidth),
      );

      this.source = source;
      this.analyser = analyser;
      this.band = { start, end, divisor: Math.max(1, end - start) * 255 };
      this.data = new Uint8Array(analyser.frequencyBinCount);
      this.level = 0;
      this.frame = requestAnimationFrame(this.tick);
    } catch {
      this.detach();
    }
  }

  private readonly tick = (): void => {
    const analyser = this.analyser;
    const data = this.data;
    if (!analyser || !data) return;

    analyser.getByteFrequencyData(data);
    const { start, end, divisor } = this.band;
    let sum = 0;
    for (let i = start; i < end; i++) sum += data[i];
    const raw = sum / divisor;

    const ease = raw > this.level ? LEVEL_RISE : LEVEL_FALL;
    this.level += (raw - this.level) * ease;
    this.onLevel(this.level);

    this.frame = requestAnimationFrame(this.tick);
  };

  detach(): void {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    try {
      this.source?.disconnect();
    } catch {}
    try {
      this.analyser?.disconnect();
    } catch {}
    this.source = null;
    this.analyser = null;
    this.data = null;
    if (this.level !== 0) {
      this.level = 0;
      this.onLevel(0);
    }
  }

  destroy(): void {
    this.detach();
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {});
  }
}
