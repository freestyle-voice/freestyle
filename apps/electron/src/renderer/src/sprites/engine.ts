import type {
  AnimationMeta,
  PerformanceStep,
  SheetSpriteDefinition,
} from "./types";

/**
 * One canvas, one rAF loop, a sequencer — plays any sheet sprite's manifest.
 * Sheets are horizontal strips of uniform frames, drawn facing right; left
 * is a canvas flip, never baked frames. Generalized from the original
 * JebEngine; the sprite-specific parts (frame metadata, projectiles) come
 * from the definition.
 */

interface Projectile {
  img: HTMLImageElement;
  size: number;
  spin: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
}

interface Playing {
  state: string;
  meta: AnimationMeta;
  frame: number;
  acc: number;
  reverse: boolean;
  fpsScale: number;
  loopsLeft: number;
  holdMs: number;
  onImpact?: () => void;
  onDone?: () => void;
  impactFired: boolean;
  faceOverride?: "left" | "right";
}

type EngineStep = PerformanceStep & {
  onImpact?: () => void;
  onDone?: () => void;
};

export class SheetEngine {
  private ctx: CanvasRenderingContext2D;
  private images = new Map<string, HTMLImageElement>();
  private fxImages = new Map<string, HTMLImageElement>();
  private playing: Playing | null = null;
  private queue: Playing[] = [];
  facing: "left" | "right" = "right";
  /** What to loop when the queue drains (idle, sleeping, thinking). */
  ambient: string;
  private projectiles: Projectile[] = [];
  private raf = 0;
  private last = 0;
  private readonly size: number;
  private readonly spriteSize: number;
  private readonly dx: number;
  private readonly dy: number;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly def: SheetSpriteDefinition,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
    this.ambient = "idle";
    this.size = def.windowSize;
    this.spriteSize = def.manifest.frameSize * def.manifest.scale;
    this.dx = def.draw?.dx ?? (this.size - this.spriteSize) / 2;
    this.dy = def.draw?.dy ?? this.size - this.spriteSize - 8;
    for (const [name, meta] of Object.entries(def.manifest.states)) {
      const url = def.sheets[meta.sheet];
      if (!url) continue;
      const img = new Image();
      img.src = url;
      this.images.set(name, img);
    }
    for (const [name, fx] of Object.entries(def.fx ?? {})) {
      const url = def.sheets[fx.sheet];
      if (!url) continue;
      const img = new Image();
      img.src = url;
      this.fxImages.set(name, img);
    }
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  /** The state currently on screen (test hook + performer introspection). */
  get currentState(): string | null {
    return this.playing?.state ?? null;
  }

  /** Launch a projectile from the body; it exits the canvas. */
  spawnFx(name: string, angleDeg: number): void {
    const fx = this.def.fx?.[name];
    const img = this.fxImages.get(name);
    if (!fx || !img) return;
    const rad = (angleDeg * Math.PI) / 180;
    const mirror = this.facing === "left" ? -1 : 1;
    this.projectiles.push({
      img,
      size: fx.size,
      spin: fx.spin,
      x: this.facing === "left" ? this.size - fx.origin.x : fx.origin.x,
      y: fx.origin.y,
      vx: Math.cos(rad) * fx.speed * mirror,
      vy: Math.sin(rad) * fx.speed,
      rot: 0,
    });
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
  }

  private makePlaying(step: EngineStep): Playing | null {
    const meta = this.def.manifest.states[step.state];
    if (!meta) return null;
    return {
      state: step.state,
      meta,
      frame: step.reverse ? meta.frames - 1 : 0,
      acc: 0,
      reverse: step.reverse ?? false,
      fpsScale: step.fpsScale ?? 1,
      loopsLeft: step.loops ?? 1,
      holdMs: step.holdMs ?? 0,
      onImpact: step.onImpact,
      onDone: step.onDone,
      impactFired: false,
      faceOverride: step.face,
    };
  }

  /** Replace everything with this sequence (used by performances). */
  playSequence(steps: EngineStep[], onAllDone?: () => void): void {
    this.queue = steps
      .map((s) => this.makePlaying(s))
      .filter((p): p is Playing => p !== null);
    const lastStep = this.queue[this.queue.length - 1];
    if (lastStep && onAllDone) {
      const prev = lastStep.onDone;
      lastStep.onDone = () => {
        prev?.();
        onAllDone();
      };
    } else if (!lastStep && onAllDone) {
      onAllDone();
    }
    this.playing = this.queue.shift() ?? null;
    if (this.playing?.faceOverride) this.facing = this.playing.faceOverride;
  }

  /** Drop any sequence and loop the ambient state. */
  setAmbient(state: string): void {
    this.ambient = state;
    if (!this.playing || this.playing.meta.loop) {
      this.playing = null;
      this.queue = [];
    }
  }

  get busy(): boolean {
    // The ambient loop (infinite) is the sprite at rest, not work in
    // progress — counting it froze sleep and micro-behaviors forever.
    return (
      this.queue.length > 0 ||
      (this.playing !== null &&
        this.playing.loopsLeft !== Number.POSITIVE_INFINITY)
    );
  }

  private advance(dtMs: number): void {
    let p = this.playing;
    if (!p) {
      const meta = this.def.manifest.states[this.ambient];
      if (!meta) return;
      p = this.playing = {
        state: this.ambient,
        meta,
        frame: 0,
        acc: 0,
        reverse: false,
        fpsScale: 1,
        loopsLeft: Number.POSITIVE_INFINITY,
        holdMs: 0,
        impactFired: false,
      };
    }
    // Ambient loops track ambient changes (thinking → idle etc.).
    if (p.loopsLeft === Number.POSITIVE_INFINITY && p.state !== this.ambient) {
      this.playing = null;
      return;
    }
    p.acc += dtMs;
    const frameMs = 1000 / (p.meta.fps * p.fpsScale);
    while (p.acc >= frameMs) {
      p.acc -= frameMs;
      const nextFrame = p.frame + (p.reverse ? -1 : 1);
      const past = p.reverse ? nextFrame < 0 : nextFrame >= p.meta.frames;
      if (!past) {
        p.frame = nextFrame;
        if (
          !p.impactFired &&
          !p.reverse &&
          p.meta.impactFrame != null &&
          p.frame >= p.meta.impactFrame
        ) {
          p.impactFired = true;
          p.onImpact?.();
        }
        continue;
      }
      // A cycle ended.
      if (p.meta.loop && p.loopsLeft > 1) {
        p.loopsLeft -= 1;
        p.frame = p.reverse ? p.meta.frames - 1 : 0;
        continue;
      }
      if (p.holdMs > 0) {
        p.holdMs -= frameMs;
        continue;
      }
      if (p.meta.holdLast && this.queue.length === 0 && !p.onDone) {
        // Terminal hold (sleep): stay on the final frame forever.
        return;
      }
      p.onDone?.();
      // onDone may synchronously start a new sequence (the performer chains
      // its pending slot) — advancing past it here would clobber it.
      if (this.playing !== p) return;
      this.playing = this.queue.shift() ?? null;
      if (this.playing?.faceOverride) {
        this.facing = this.playing.faceOverride;
      }
      return;
    }
  }

  private loop(now: number): void {
    const dt = this.last ? Math.min(100, now - this.last) : 16;
    this.last = now;
    this.advance(dt);
    const p = this.playing;
    this.ctx.clearRect(0, 0, this.size, this.size);
    if (p) {
      const img = this.images.get(p.state);
      if (img?.complete && img.naturalWidth > 0) {
        this.ctx.save();
        if (this.facing === "left") {
          this.ctx.translate(this.size, 0);
          this.ctx.scale(-1, 1);
        }
        this.ctx.drawImage(
          img,
          ((p.meta.start ?? 0) + p.frame) * this.def.manifest.frameSize,
          0,
          this.def.manifest.frameSize,
          this.def.manifest.frameSize,
          this.dx,
          this.dy,
          this.spriteSize,
          this.spriteSize,
        );
        this.ctx.restore();
      }
    }
    if (this.projectiles.length > 0) {
      const dtS = dt / 1000;
      this.projectiles = this.projectiles.filter((pr) => {
        pr.x += pr.vx * dtS;
        pr.y += pr.vy * dtS;
        pr.rot += pr.spin * dtS;
        const margin = pr.size;
        return (
          pr.x > -margin &&
          pr.x < this.size + margin &&
          pr.y > -margin &&
          pr.y < this.size + margin
        );
      });
      for (const pr of this.projectiles) {
        if (!pr.img.complete || pr.img.naturalWidth === 0) continue;
        this.ctx.save();
        this.ctx.translate(pr.x, pr.y);
        this.ctx.rotate(pr.rot);
        this.ctx.drawImage(
          pr.img,
          -pr.size / 2,
          -pr.size / 2,
          pr.size,
          pr.size,
        );
        this.ctx.restore();
      }
    }
    this.raf = requestAnimationFrame(this.loop);
  }
}
