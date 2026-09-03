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

/** A short, glanceable activity label surfaced above the companion. */
export interface CompanionStatus {
  source: "remix";
  label: string;
}

export function parseCompanionStatus(value: unknown): CompanionStatus | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as { source?: unknown; label?: unknown };
  if (candidate.source !== "remix" || typeof candidate.label !== "string") {
    return null;
  }
  const label = candidate.label.replace(/\s+/g, " ").trim().slice(0, 160);
  return label ? { source: "remix", label } : null;
}

/** Sheet sprites face inward toward the usable area of their display. */
export type CompanionFacing = "left" | "right";

/** The small handle shown below a companion for native repositioning. */
export const COMPANION_DOCK = { width: 30, height: 6, gap: 6 } as const;
/** Space a sheet companion must reserve below its feet for that handle. */
export const COMPANION_DOCK_CLEARANCE =
  COMPANION_DOCK.height + COMPANION_DOCK.gap;

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
