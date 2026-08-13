import type { SpriteEmotion, ToolClass } from "@shared/sprite-events";
import type { SpriteInfo } from "@shared/sprites";

export interface AnimationMeta {
  sheet: string;
  frames: number;
  fps: number;
  loop: boolean;
  holdLast?: boolean;
  /** First frame within the sheet — lets states share one strip (Jeb's
   *  sit-down and typing loop both live in typing.png). */
  start?: number;
  /** Frame index where the animation "lands" — the sync contract between a
   *  performance and the OS action it decorates. */
  impactFrame?: number;
}

export interface SpriteManifest {
  frameSize: number;
  scale: number;
  states: Record<string, AnimationMeta>;
}

export interface PerformanceStep {
  state: string;
  /** Repeat a looping state this many cycles (default 1 for non-loop). */
  loops?: number;
  /** Hold the state's final frame for this long after playing. */
  holdMs?: number;
  face?: "left" | "right";
  /** Play the sheet backwards (Jeb standing back up from sleep). */
  reverse?: boolean;
  fpsScale?: number;
  /** Projectile launched at this step's impact frame, by fx name. */
  fx?: string;
  /** Launch angle in degrees: 0 = right, negative = upward. */
  fxAngle?: number;
}

export type Performance = PerformanceStep[];

export interface FxSpec {
  sheet: string;
  size: number;
  speed: number;
  /** Radians per second of spin. */
  spin: number;
  /** Where projectiles leave the body, in canvas coordinates (facing right). */
  origin: { x: number; y: number };
}

export interface ChoreographyTable {
  tool: {
    byName: Record<string, Performance>;
    byClass: Partial<Record<ToolClass, Performance>>;
    default?: Performance;
  };
  toolError?: Performance;
  /** Ambient state looped while an approval card waits on the user. */
  approvalHold?: string;
  turnDone?: Performance;
  turnError?: Performance;
  emote: Partial<Record<SpriteEmotion, Performance>>;
  ambients: { thinking?: string; listening?: string };
  /** One-shot transitions bookending the thinking ambient (sit down at the
   *  laptop, stand back up). */
  thinkingEnter?: Performance;
  thinkingExit?: Performance;
  sleep?: { enter: Performance; ambient: string };
  wake?: Performance;
  micro?: Performance[];
}

interface SpriteDefinitionBase extends SpriteInfo {
  /** Cursor hitbox = exactly the drawn body, in window coordinates. */
  hotRect: { x: number; y: number; width: number; height: number };
  bubble: { x: number; y: number; maxChars: number };
}

export interface SheetSpriteDefinition extends SpriteDefinitionBase {
  kind: "sheet";
  manifest: SpriteManifest;
  /** Sheet filename → bundled URL (built with import.meta.glob). */
  sheets: Record<string, string>;
  fx?: Record<string, FxSpec>;
  /** Sprite draw offset inside the window; defaults to centered, feet 8px up. */
  draw?: { dx: number; dy: number };
  timings: { sleepAfterMs: number; microMinMs: number; microMaxMs: number };
  choreography: ChoreographyTable;
}

export interface CustomSpriteDefinition extends SpriteDefinitionBase {
  /** Rendered by its own bespoke React component (Spark). */
  kind: "custom";
}

export type SpriteDefinition = SheetSpriteDefinition | CustomSpriteDefinition;
