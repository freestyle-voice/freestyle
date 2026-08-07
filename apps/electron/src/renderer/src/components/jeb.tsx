import { capture } from "@renderer/lib/analytics";
import {
  JEB_SLEEP_AFTER_MS,
  JEB_SPRITE_SIZE,
  JEB_WINDOW_SIZE,
  type JebStateName,
  type JebStep,
  type JebTravelEvent,
} from "@shared/jeb";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { JEB_MANIFEST, type JebStateMeta } from "../assets/jeb/manifest";

/**
 * Samurai Jeb's renderer: one canvas, one rAF loop, a sequencer. The window
 * never scrolls or grows — travel is the main process moving the window;
 * this component only ever draws a 192px sprite centered near the bottom.
 *
 * Sprite sheets face right; left is a canvas flip, never baked frames.
 */

const SHEET_URLS = import.meta.glob("../assets/jeb/*.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const SHURIKEN_URL = SHEET_URLS["../assets/jeb/shuriken.png"];

interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
}

const DX = (JEB_WINDOW_SIZE - JEB_SPRITE_SIZE) / 2;
const DY = JEB_WINDOW_SIZE - JEB_SPRITE_SIZE - 8;
const FRAME = JEB_MANIFEST.frameSize;

/** Cursor target: exactly the drawn body, measured from the frames' alpha —
 *  canvas x 100–144, y 150–218 at 2x. Anything larger triggers the chat from
 *  transparent air around the sprite. */
const HOT_RECT = { x: 100, y: 150, width: 44, height: 68 };
/** Where thrown projectiles leave his hand, in canvas coordinates. */
const HAND = { x: 126, y: 170 };
const SHURIKEN_SPEED = 520;
const SHURIKEN_SIZE = 24;
const SHURIKEN_SPIN = 18;
const SLEEP_CHECK_MS = 2_000;
const HOVER_DWELL_MS = 300;
const BUBBLE_HIDE_MS = 4_000;
const MICRO_MIN_MS = 45_000;
const MICRO_MAX_MS = 120_000;

interface Playing {
  state: JebStateName;
  meta: JebStateMeta;
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

class JebEngine {
  private ctx: CanvasRenderingContext2D;
  private images = new Map<JebStateName, HTMLImageElement>();
  private playing: Playing | null = null;
  private queue: Playing[] = [];
  facing: "left" | "right" = "right";
  /** What to loop when the queue drains (idle, sleeping, thinking, travel). */
  ambient: JebStateName = "idle";
  private projectiles: Projectile[] = [];
  private shuriken: HTMLImageElement | null = null;
  private raf = 0;
  private last = 0;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    this.ctx = ctx;
    this.ctx.imageSmoothingEnabled = false;
    for (const [name, meta] of Object.entries(JEB_MANIFEST.states)) {
      const url = SHEET_URLS[`../assets/jeb/${meta.sheet}`];
      if (!url) continue;
      const img = new Image();
      img.src = url;
      this.images.set(name as JebStateName, img);
    }
    if (SHURIKEN_URL) {
      this.shuriken = new Image();
      this.shuriken.src = SHURIKEN_URL;
    }
    this.loop = this.loop.bind(this);
    this.raf = requestAnimationFrame(this.loop);
  }

  /** Launch a spinning shuriken from his hand; it exits the canvas. */
  throwShuriken(angleDeg: number): void {
    const rad = (angleDeg * Math.PI) / 180;
    const mirror = this.facing === "left" ? -1 : 1;
    this.projectiles.push({
      x: this.facing === "left" ? JEB_WINDOW_SIZE - HAND.x : HAND.x,
      y: HAND.y,
      vx: Math.cos(rad) * SHURIKEN_SPEED * mirror,
      vy: Math.sin(rad) * SHURIKEN_SPEED,
      rot: 0,
    });
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
  }

  private makePlaying(
    step: JebStep & {
      reverse?: boolean;
      fpsScale?: number;
      onImpact?: () => void;
      onDone?: () => void;
    },
  ): Playing {
    const meta = JEB_MANIFEST.states[step.state];
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
  playSequence(
    steps: Array<
      JebStep & {
        reverse?: boolean;
        fpsScale?: number;
        onImpact?: () => void;
        onDone?: () => void;
      }
    >,
    onAllDone?: () => void,
  ): void {
    this.queue = steps.map((s) => this.makePlaying(s));
    const lastStep = this.queue[this.queue.length - 1];
    if (lastStep && onAllDone) {
      const prev = lastStep.onDone;
      lastStep.onDone = () => {
        prev?.();
        onAllDone();
      };
    }
    this.playing = this.queue.shift() ?? null;
    if (this.playing?.faceOverride) this.facing = this.playing.faceOverride;
  }

  /** Drop any sequence and loop the ambient state. */
  setAmbient(state: JebStateName): void {
    this.ambient = state;
    if (!this.playing || this.playing.meta.loop) {
      this.playing = null;
      this.queue = [];
    }
  }

  get busy(): boolean {
    // The ambient loop (infinite) is Jeb at rest, not work in progress —
    // counting it froze sleep and micro-behaviors forever.
    return (
      this.queue.length > 0 ||
      (this.playing !== null &&
        this.playing.loopsLeft !== Number.POSITIVE_INFINITY)
    );
  }

  private advance(dtMs: number): void {
    let p = this.playing;
    if (!p) {
      const meta = JEB_MANIFEST.states[this.ambient];
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
    this.ctx.clearRect(0, 0, JEB_WINDOW_SIZE, JEB_WINDOW_SIZE);
    if (p) {
      const img = this.images.get(p.state);
      if (img?.complete && img.naturalWidth > 0) {
        this.ctx.save();
        if (this.facing === "left") {
          this.ctx.translate(JEB_WINDOW_SIZE, 0);
          this.ctx.scale(-1, 1);
        }
        this.ctx.drawImage(
          img,
          p.frame * FRAME,
          0,
          FRAME,
          FRAME,
          DX,
          DY,
          JEB_SPRITE_SIZE,
          JEB_SPRITE_SIZE,
        );
        this.ctx.restore();
      }
    }
    if (this.projectiles.length > 0) {
      const dtS = dt / 1000;
      const margin = SHURIKEN_SIZE;
      this.projectiles = this.projectiles.filter((pr) => {
        pr.x += pr.vx * dtS;
        pr.y += pr.vy * dtS;
        pr.rot += SHURIKEN_SPIN * dtS;
        return (
          pr.x > -margin &&
          pr.x < JEB_WINDOW_SIZE + margin &&
          pr.y > -margin &&
          pr.y < JEB_WINDOW_SIZE + margin
        );
      });
      const img = this.shuriken;
      if (img?.complete && img.naturalWidth > 0) {
        for (const pr of this.projectiles) {
          this.ctx.save();
          this.ctx.translate(pr.x, pr.y);
          this.ctx.rotate(pr.rot);
          this.ctx.drawImage(
            img,
            -SHURIKEN_SIZE / 2,
            -SHURIKEN_SIZE / 2,
            SHURIKEN_SIZE,
            SHURIKEN_SIZE,
          );
          this.ctx.restore();
        }
      }
    }
    this.raf = requestAnimationFrame(this.loop);
  }
}

function JebRoot(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [bubble, setBubble] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const engine = new JebEngine(canvas);
    let asleep = false;
    let thinking = false;
    let lastActivity = Date.now();
    let bubbleTimer: ReturnType<typeof setTimeout> | null = null;
    let dwellTimer: ReturnType<typeof setTimeout> | null = null;
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    const say = (text: string): void => {
      setBubble(text);
      if (bubbleTimer) clearTimeout(bubbleTimer);
      bubbleTimer = setTimeout(() => setBubble(null), BUBBLE_HIDE_MS);
    };

    const wake = (): void => {
      lastActivity = Date.now();
      if (!asleep) return;
      asleep = false;
      setBubble(null);
      engine.ambient = "idle";
      // Getting up: the fall, backwards, fast — then a hop to attention.
      engine.playSequence([
        { state: "death", reverse: true, fpsScale: 2 },
        { state: "jump-start" },
      ]);
      capture("jeb_woken", {});
    };

    const sleep = (): void => {
      if (asleep || engine.busy || thinking) return;
      asleep = true;
      engine.playSequence([{ state: "death" }]);
      engine.ambient = "death";
      capture("jeb_slept", {});
    };

    const sleepTimer = setInterval(() => {
      if (Date.now() - lastActivity > JEB_SLEEP_AFTER_MS) sleep();
    }, SLEEP_CHECK_MS);

    const microBehaviors: Array<() => void> = [
      () =>
        engine.playSequence([
          { state: "walk", loops: 2, face: "left" },
          { state: "walk", loops: 2, face: "right" },
        ]),
      () => engine.playSequence([{ state: "defend", holdMs: 400 }]),
      () => engine.playSequence([{ state: "attack-1" }]),
      () => engine.playSequence([{ state: "dash", loops: 1 }]),
    ];

    let microTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleMicro = (): void => {
      const delay =
        MICRO_MIN_MS + Math.random() * (MICRO_MAX_MS - MICRO_MIN_MS);
      microTimer = setTimeout(() => {
        if (!asleep && !thinking && !engine.busy && !reducedMotion) {
          microBehaviors[Math.floor(Math.random() * microBehaviors.length)]();
        }
        scheduleMicro();
      }, delay);
    };
    scheduleMicro();

    const offPerform = window.api.onJebPerform(({ id, steps, say: text }) => {
      wake();
      lastActivity = Date.now();
      if (text) say(text);
      const sequence = (steps as JebStep[]).map((step) => ({
        ...step,
        onImpact: () => {
          window.api.jebImpact(id);
          if (step.fx === "shuriken") {
            engine.throwShuriken(step.fxAngle ?? -55);
          }
        },
      }));
      engine.playSequence(sequence, () => window.api.jebPerformDone(id));
      // A performance with no impact frame still resolves the sync lane —
      // fire on start so nothing waits the full ceiling needlessly.
      const anyImpact = (steps as JebStep[]).some(
        (s) => JEB_MANIFEST.states[s.state]?.impactFrame != null,
      );
      if (!anyImpact) window.api.jebImpact(id);
    });

    const offTravel = window.api.onJebTravel((ev: JebTravelEvent) => {
      wake();
      lastActivity = Date.now();
      engine.facing = ev.direction;
      if (ev.phase === "start") {
        const state: JebStateName =
          ev.kind === "walk"
            ? "walk"
            : ev.kind === "dash"
              ? "dash"
              : ev.kind === "jump"
                ? "jump"
                : "run";
        engine.setAmbient(state);
      } else {
        engine.setAmbient(thinking ? "healing" : "idle");
        // Land facing the audience.
        engine.facing = "right";
      }
    });

    const offSay = window.api.onJebSay((text) => {
      wake();
      say(text);
    });

    const offThinking = window.api.onJebThinking((on) => {
      thinking = on;
      wake();
      lastActivity = Date.now();
      if (!engine.busy || engine.ambient !== "idle") {
        engine.setAmbient(on ? "healing" : "idle");
      } else {
        engine.ambient = on ? "healing" : "idle";
      }
    });

    const offWake = window.api.onJebWake(() => wake());
    const offHotEnter = window.api.onJebHotEnter(() => {
      wake();
    });

    // Click-through everywhere except the body. The dwell listens on the
    // hitbox div (exactly the sprite), NOT the window — once the window is
    // interactive, body-level hover fires from the transparent air too.
    window.api.jebSetHotRect(HOT_RECT);
    const hitbox = document.getElementById("jeb-hitbox");
    const onLeave = (): void => {
      if (dwellTimer) {
        clearTimeout(dwellTimer);
        dwellTimer = null;
      }
      window.api.jebSetHotRect(HOT_RECT);
    };
    const onEnter = (): void => {
      wake();
      if (dwellTimer) clearTimeout(dwellTimer);
      dwellTimer = setTimeout(() => {
        window.api.jebHoverOpen();
      }, HOVER_DWELL_MS);
    };
    hitbox?.addEventListener("mouseenter", onEnter);
    hitbox?.addEventListener("mouseleave", onLeave);

    return () => {
      engine.destroy();
      offPerform();
      offTravel();
      offSay();
      offThinking();
      offWake();
      offHotEnter();
      if (microTimer) clearTimeout(microTimer);
      clearInterval(sleepTimer);
      if (bubbleTimer) clearTimeout(bubbleTimer);
      if (dwellTimer) clearTimeout(dwellTimer);
      hitbox?.removeEventListener("mouseenter", onEnter);
      hitbox?.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  return (
    <div className="jeb-stage">
      <style>{`
        html, body, #root { margin: 0; height: 100%; background: transparent; overflow: hidden; }
        .jeb-stage { position: relative; width: ${JEB_WINDOW_SIZE}px; height: ${JEB_WINDOW_SIZE}px; -webkit-user-select: none; user-select: none; }
        canvas { image-rendering: pixelated; }
        .jeb-bubble {
          position: absolute;
          left: ${HOT_RECT.x + 6}px;
          bottom: ${JEB_SPRITE_SIZE - 24}px;
          max-width: ${JEB_WINDOW_SIZE - HOT_RECT.x - 14}px;
          padding: 6px 10px;
          border-radius: 8px;
          background: rgba(22, 20, 15, 0.96);
          border: 1px solid rgba(245, 241, 228, 0.4);
          color: rgba(245, 241, 228, 0.95);
          font: 12px/1.35 ui-monospace, "SF Mono", Menlo, monospace;
          text-align: center;
          pointer-events: none;
          white-space: pre-wrap;
        }
        .jeb-bubble::after {
          content: "";
          position: absolute;
          left: 28px;
          bottom: -5px;
          border-left: 5px solid transparent;
          border-right: 5px solid transparent;
          border-top: 5px solid rgba(22, 20, 15, 0.96);
        }
      `}</style>
      <canvas
        ref={canvasRef}
        width={JEB_WINDOW_SIZE}
        height={JEB_WINDOW_SIZE}
      />
      <div
        id="jeb-hitbox"
        style={{
          position: "absolute",
          left: HOT_RECT.x,
          top: HOT_RECT.y,
          width: HOT_RECT.width,
          height: HOT_RECT.height,
        }}
      />
      {bubble ? <div className="jeb-bubble">{bubble}</div> : null}
    </div>
  );
}

const container = document.getElementById("root");
if (container) createRoot(container).render(<JebRoot />);
