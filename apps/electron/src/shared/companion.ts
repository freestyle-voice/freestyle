import {
  DEFAULT_SPRITE,
  parseSpriteId,
  SPRITE_IDS,
  SPRITES_INFO,
  type SpriteId,
} from "./sprites.js";

export const COMPANION_WINDOW_SIZE = Math.max(
  ...Object.values(SPRITES_INFO).map((s) => s.windowSize),
);

export const COMPANION_FORMS = SPRITE_IDS;
export type CompanionForm = SpriteId;
export const DEFAULT_COMPANION_FORM: CompanionForm = DEFAULT_SPRITE;

export const parseCompanionForm = parseSpriteId;

export type CompanionState = "idle" | "working" | "suggestion";

export const COMPANION_HOVER_DWELL_MS = 300;

export const DICTATION_DESTINATIONS = ["cursor", "composer"] as const;
export type DictationDestinationSetting =
  (typeof DICTATION_DESTINATIONS)[number];
export const DEFAULT_DICTATION_DESTINATION: DictationDestinationSetting =
  "cursor";

export function parseDictationDestination(
  value: string | null | undefined,
): DictationDestinationSetting {
  return DICTATION_DESTINATIONS.includes(value as DictationDestinationSetting)
    ? (value as DictationDestinationSetting)
    : DEFAULT_DICTATION_DESTINATION;
}
