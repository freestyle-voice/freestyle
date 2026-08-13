import { SPRITES_INFO, type SpriteId } from "@shared/sprites";
import { JEB } from "./jeb";
import type { SpriteDefinition } from "./types";

/**
 * The renderer half of the sprite registry. Adding a character: drop sheet
 * strips in assets/<id>/, run scripts/pack-sprites.js, write one definition
 * file, add it here and to shared/sprites.ts. Settings and window placement
 * pick it up automatically. `kind: "custom"` sprites (Spark) keep bespoke
 * React renderers in companion.tsx.
 */
export const SPRITES: Record<SpriteId, SpriteDefinition> = {
  spark: {
    ...SPRITES_INFO.spark,
    kind: "custom",
    hotRect: { x: 18, y: 190, width: 52, height: 52 },
    bubble: { x: 12, y: 68, maxChars: 220 },
  },
  jeb: JEB,
};
