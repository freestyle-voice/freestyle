/**
 * Samurai Jeb — the character overlay. A choreography script is the unit of
 * work: the pill renderer builds one per agent tool call (see
 * renderer/src/lib/jeb-choreo.ts), the main process resolves the travel
 * target and moves the window, and the Jeb renderer plays the sprite steps.
 *
 * Scripts are deterministic client code, never model output: the agent's
 * only handles on Jeb are the jeb_say / jeb_emote tools, which map to fixed
 * scripts here.
 */

export type JebStateName =
  | "idle"
  | "walk"
  | "run"
  | "dash"
  | "jump-start"
  | "jump"
  | "jump-transition"
  | "jump-fall"
  | "wall-contact"
  | "wall-slide"
  | "wall-jump"
  | "climbing"
  | "attack-1"
  | "attack-2"
  | "attack-3"
  | "air-attack"
  | "special-attack"
  | "throw"
  | "defend"
  | "hurt"
  | "death"
  | "healing"
  | "healing-no-effect";

export interface JebStep {
  state: JebStateName;
  /** Repeat a looping state this many cycles (default 1 for non-loop). */
  loops?: number;
  /** Hold the state's final frame for this long after playing. */
  holdMs?: number;
  face?: "left" | "right";
  /** Projectile launched at this step's impact frame. */
  fx?: "shuriken";
  /** Launch angle in degrees: 0 = right, negative = upward. */
  fxAngle?: number;
}

/** Where a script performs. Resolved to screen coordinates by the main process. */
export type JebTravelTarget = "focused-window" | "screen-edge" | "home";

export type JebTravelKind = "walk" | "run" | "dash" | "jump";

export interface JebScript {
  /** Correlation id minted by the sender; impact/done signals carry it back. */
  id: string;
  travel?: JebTravelTarget;
  travelKind?: JebTravelKind;
  performance: JebStep[];
  returnHome?: boolean;
  /** Bubble text shown while performing (≤80 chars — status, not answers). */
  say?: string;
}

export interface JebTravelEvent {
  phase: "start" | "end";
  kind: JebTravelKind;
  direction: "left" | "right";
}

export const JEB_WINDOW_SIZE = 256;
/** Sprite draw size inside the window (2x the 96px frame). */
export const JEB_SPRITE_SIZE = 192;
/** Travel is capped: distance changes speed, not duration. */
export const JEB_TRAVEL_MAX_MS = 700;
/** Deferred OS actions fire at impact or at this ceiling, whichever first. */
export const JEB_IMPACT_CEILING_MS = 900;
/** Ceiling for sync scripts that travel first (paste): target resolution +
 *  the capped travel + the swing wind-up must all fit, or the paste lands
 *  long before Jeb does and the theater falls apart. */
export const JEB_IMPACT_TRAVEL_CEILING_MS = 2_600;
export const JEB_SLEEP_AFTER_MS = 10_000;
export const JEB_SAY_MAX = 80;

export type JebEmotion = "proud" | "confused" | "alarmed" | "sorry";

export const JEB_EMOTION_STATES: Record<JebEmotion, JebStateName> = {
  proud: "air-attack",
  confused: "healing-no-effect",
  alarmed: "defend",
  sorry: "hurt",
};
