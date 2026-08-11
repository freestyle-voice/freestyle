import { capture } from "@renderer/lib/analytics";
import type { SpriteEvent } from "@shared/sprite-events";
import type { SheetEngine } from "./engine";
import type {
  Performance,
  PerformanceStep,
  SheetSpriteDefinition,
} from "./types";

const SLEEP_CHECK_MS = 2_000;

/**
 * The arbiter between Freestyle's event stream and a sheet sprite's frames.
 * Written once, shared by every sprite: the choreography table says WHAT to
 * play, the performer decides WHEN — errors interrupt, rapid tool calls
 * coalesce instead of queueing a backlog, approval poses hold until
 * resolved, ambient states stack by priority (hold > listening > thinking >
 * idle), and sleep/wake/micro-behaviors run on the definition's timings.
 */
export class Performer {
  private asleep = false;
  private thinking = false;
  private listening = false;
  private approvalPending = false;
  private traveling = false;
  private wasAtDesk = false;
  private lastActivity = Date.now();
  private performing = false;
  private pending: Performance | null = null;
  private sleepTimer: ReturnType<typeof setInterval>;
  private microTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly engine: SheetEngine,
    private readonly def: SheetSpriteDefinition,
    private readonly reducedMotion: boolean,
    private readonly hooks: {
      onSleepChange?: (asleep: boolean) => void;
      onShout?: (text: string) => void;
    } = {},
  ) {
    this.sleepTimer = setInterval(() => {
      if (Date.now() - this.lastActivity > def.timings.sleepAfterMs) {
        this.trySleep();
      }
    }, SLEEP_CHECK_MS);
    this.scheduleMicro();
    this.refreshAmbient();
  }

  destroy(): void {
    clearInterval(this.sleepTimer);
    if (this.microTimer) clearTimeout(this.microTimer);
  }

  snapshot(): {
    ambient: string;
    playing: string | null;
    asleep: boolean;
    performing: boolean;
  } {
    return {
      ambient: this.engine.ambient,
      playing: this.engine.currentState,
      asleep: this.asleep,
      performing: this.performing,
    };
  }

  handle(ev: SpriteEvent): void {
    const c = this.def.choreography;
    switch (ev.kind) {
      case "thinking":
        this.thinking = ev.on;
        if (ev.on) this.wake();
        this.refreshAmbient();
        return;
      case "listening":
        this.listening = ev.on;
        if (ev.on) this.wake();
        this.refreshAmbient();
        return;
      case "approval":
        this.approvalPending = ev.pending;
        if (ev.pending) this.wake();
        this.refreshAmbient();
        return;
      case "tool":
        if (ev.phase === "start") {
          this.perform(
            c.tool.byName[ev.name] ??
              c.tool.byClass[ev.toolClass] ??
              c.tool.default,
          );
        } else if (ev.phase === "error") {
          this.perform(c.toolError, { interrupt: true });
        } else {
          this.lastActivity = Date.now();
        }
        return;
      case "turn":
        if (ev.phase === "error") {
          this.perform(c.turnError ?? c.toolError, { interrupt: true });
        } else if (!this.performing) {
          // The flourish plays only from a clean queue — finishing a turn
          // mid-swing shouldn't stack theatrics.
          this.perform(c.turnDone);
        }
        return;
      case "emote":
        this.perform(c.emote[ev.emotion]);
        return;
      case "travel":
        this.wake();
        if (ev.phase === "start") {
          this.traveling = true;
          // We're flying — drop any queued theater, it belongs to the corner.
          this.pending = null;
          this.engine.facing = ev.direction;
          this.engine.setAmbient(this.travelState(ev.travelKind));
        } else {
          this.traveling = false;
          // Land facing the audience.
          this.engine.facing = "right";
          this.refreshAmbient();
        }
        return;
      case "perform-sync": {
        const perf =
          c.tool.byName[ev.name] ??
          c.tool.byClass[ev.toolClass] ??
          c.tool.default;
        const impact = (): void => {
          window.api.spriteImpact(ev.nonce);
          // The manga shout burst — the flash when a paste lands.
          if (ev.toolClass === "deliver") this.hooks.onShout?.("PASTED!");
        };
        const done = (): void => window.api.spritePerformDone(ev.nonce);
        // Never stall the OS action waiting on theater that can't happen.
        if (!perf || perf.length === 0 || this.reducedMotion) {
          impact();
          done();
          return;
        }
        this.wake();
        this.pending = null;
        this.play(perf, { onImpact: impact, onDone: done });
        return;
      }
    }
  }

  private travelState(kind: string): string {
    const states = this.def.manifest.states;
    if (states[kind]) return kind;
    if (states.run) return "run";
    return "idle";
  }

  wake(): void {
    this.lastActivity = Date.now();
    if (!this.asleep) return;
    this.asleep = false;
    this.hooks.onSleepChange?.(false);
    this.refreshAmbient();
    const wakePerf = this.def.choreography.wake;
    if (wakePerf) this.play(wakePerf);
    capture("sprite_woken", { sprite: this.def.id });
  }

  private trySleep(): void {
    const sleep = this.def.choreography.sleep;
    if (!sleep || this.asleep) return;
    if (
      this.performing ||
      this.engine.busy ||
      this.thinking ||
      this.listening ||
      this.approvalPending ||
      this.traveling
    ) {
      return;
    }
    this.asleep = true;
    this.hooks.onSleepChange?.(true);
    this.play(sleep.enter);
    this.engine.ambient = sleep.ambient;
    capture("sprite_slept", { sprite: this.def.id });
  }

  /** hold > listening > thinking > idle. */
  private refreshAmbient(): void {
    if (this.asleep || this.traveling) return;
    const c = this.def.choreography;
    const hold = this.approvalPending ? c.approvalHold : null;
    const next =
      hold ??
      (this.listening ? (c.ambients.listening ?? "idle") : null) ??
      (this.thinking ? (c.ambients.thinking ?? "idle") : null) ??
      "idle";
    // The desk transitions (sit down / stand up) only play when the thinking
    // ambient actually WINS the priority stack — flipping thinking on while
    // listening or holding an approval must not fake a sit-down that the
    // real ambient immediately cancels.
    const atDesk = !hold && !this.listening && this.thinking;
    if (atDesk !== this.wasAtDesk) {
      this.wasAtDesk = atDesk;
      const transition = atDesk ? c.thinkingEnter : c.thinkingExit;
      if (transition && !this.performing) {
        if (this.engine.ambient !== next) this.engine.setAmbient(next);
        this.play(transition);
        return;
      }
    }
    if (this.engine.ambient !== next) this.engine.setAmbient(next);
  }

  /**
   * Coalescing is the noise guard: while a performance plays, a newcomer
   * replaces the single pending slot rather than queueing — ten fast tool
   * calls produce two sword swings, not ten.
   */
  private perform(
    perf: Performance | undefined,
    opts: { interrupt?: boolean } = {},
  ): void {
    if (!perf || perf.length === 0 || this.reducedMotion) return;
    this.wake();
    if (opts.interrupt) {
      this.pending = null;
      this.play(perf);
      return;
    }
    if (this.performing) {
      this.pending = perf;
      return;
    }
    this.play(perf);
  }

  private play(
    perf: Performance,
    hooks?: { onImpact?: () => void; onDone?: () => void },
  ): void {
    this.performing = true;
    let impactWired = false;
    const steps = perf.map((step: PerformanceStep) => {
      const fxHook = step.fx
        ? () => this.engine.spawnFx(step.fx as string, step.fxAngle ?? -55)
        : null;
      let syncHook: (() => void) | null = null;
      if (
        hooks?.onImpact &&
        !impactWired &&
        this.def.manifest.states[step.state]?.impactFrame != null
      ) {
        impactWired = true;
        syncHook = hooks.onImpact;
      }
      const onImpact =
        fxHook || syncHook
          ? (): void => {
              fxHook?.();
              syncHook?.();
            }
          : undefined;
      return { ...step, onImpact };
    });
    // A performance with no impact frame still resolves the sync lane —
    // fire on start so nothing waits the full ceiling needlessly.
    if (hooks?.onImpact && !impactWired) hooks.onImpact();
    this.engine.playSequence(steps, () => {
      this.performing = false;
      this.lastActivity = Date.now();
      hooks?.onDone?.();
      const next = this.pending;
      this.pending = null;
      if (next) this.play(next);
    });
  }

  private scheduleMicro(): void {
    const { microMinMs, microMaxMs } = this.def.timings;
    const delay = microMinMs + Math.random() * (microMaxMs - microMinMs);
    this.microTimer = setTimeout(() => {
      const pool = this.def.choreography.micro;
      if (
        pool &&
        pool.length > 0 &&
        !this.asleep &&
        !this.thinking &&
        !this.listening &&
        !this.approvalPending &&
        !this.performing &&
        !this.engine.busy &&
        !this.reducedMotion
      ) {
        this.play(pool[Math.floor(Math.random() * pool.length)]);
      }
      this.scheduleMicro();
    }, delay);
  }
}
