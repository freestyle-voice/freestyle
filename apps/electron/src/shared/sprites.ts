/**
 * The sprite registry's main-process-safe half: identity, window size, and
 * corner placement per character. The renderer half (animations,
 * choreography) lives in renderer/src/sprites/ — main must never import it.
 */

export interface SpriteAnchor {
  /** Where the drawn body's left edge sits inside the window, px. */
  bodyLeft: number;
  /** Gap between the body's feet and the window bottom, px. */
  bodyBottom: number;
  /** Breathing room between the body and the screen corner, px. */
  margin: number;
}

export interface SpriteInfo {
  id: string;
  label: string;
  /** Canvas sheet sprite vs. bespoke React renderer (Spark). */
  kind: "sheet" | "custom";
  windowSize: number;
  /**
   * Sheet sprites draw with transparent margin around the body; the anchor
   * lets main hang the window off the work area so the BODY touches the
   * corner. null = the sprite fills its own corner (Spark).
   */
  anchor: SpriteAnchor | null;
  /** May physically fly across the screen to perform deliver-class tools. */
  travel?: boolean;
}

export const SPRITES_INFO = {
  spark: {
    id: "spark",
    label: "Spark",
    kind: "custom",
    windowSize: 256,
    anchor: null,
    travel: false,
  },
  jeb: {
    id: "jeb",
    label: "Jeb",
    kind: "sheet",
    windowSize: 256,
    anchor: { bodyLeft: 100, bodyBottom: 38, margin: 4 },
    travel: true,
  },
} as const satisfies Record<string, SpriteInfo>;

/** Travel is capped: distance changes speed, not duration. */
export const SPRITE_TRAVEL_MAX_MS = 700;
/** Deferred OS actions fire at impact or at this ceiling, whichever first. */
export const SPRITE_IMPACT_CEILING_MS = 900;
/** Ceiling for sync performances that travel first (paste): target
 *  resolution + the capped travel + the swing wind-up must all fit, or the
 *  paste lands long before the sprite does and the theater falls apart. */
export const SPRITE_IMPACT_TRAVEL_CEILING_MS = 2_600;
export const SPRITE_PERFORM_TIMEOUT_MS = 15_000;

export type SpriteId = keyof typeof SPRITES_INFO;

export const SPRITE_IDS = Object.keys(SPRITES_INFO) as SpriteId[];

export const DEFAULT_SPRITE: SpriteId = "jeb";

export function parseSpriteId(value: string | null | undefined): SpriteId {
  return value && value in SPRITES_INFO ? (value as SpriteId) : DEFAULT_SPRITE;
}
