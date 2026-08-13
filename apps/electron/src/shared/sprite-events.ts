/**
 * The semantic event vocabulary — Freestyle narrating what's happening,
 * without knowing which sprite is on screen or what it will do about it.
 * Emitters (the panel's agent loop, the emote tool) speak only this; each
 * sprite's choreography table decides what an event looks like.
 */

export const TOOL_CLASSES = [
  "search",
  "read",
  "write",
  "execute",
  "deliver",
  "unknown",
] as const;
export type ToolClass = (typeof TOOL_CLASSES)[number];

const TOOL_CLASS_BY_NAME: Record<string, ToolClass> = {
  web_search: "search",
  image_search: "search",
  Glob: "search",
  Grep: "search",
  Read: "read",
  read_document: "read",
  get_clipboard: "read",
  get_context: "read",
  current_time: "read",
  Write: "write",
  Edit: "write",
  set_clipboard: "write",
  Bash: "execute",
  paste: "deliver",
};

/** Normalize a tool name so choreography scales: name → class → default. */
export function classifyTool(name: string): ToolClass {
  const direct = TOOL_CLASS_BY_NAME[name];
  if (direct) return direct;
  if (name.startsWith("brain_")) {
    const op = name.slice("brain_".length);
    if (op === "search" || op === "glob" || op === "list") return "search";
    if (op === "read") return "read";
    return "write";
  }
  return "unknown";
}

export const SPRITE_EMOTIONS = [
  "proud",
  "confused",
  "alarmed",
  "sorry",
] as const;
export type SpriteEmotion = (typeof SPRITE_EMOTIONS)[number];

export function parseSpriteEmotion(value: unknown): SpriteEmotion {
  return SPRITE_EMOTIONS.includes(value as SpriteEmotion)
    ? (value as SpriteEmotion)
    : "proud";
}

export type SpriteTravelKind = "walk" | "run" | "dash" | "jump";

export type SpriteEvent =
  | { kind: "thinking"; on: boolean }
  | { kind: "listening"; on: boolean }
  | {
      kind: "tool";
      phase: "start" | "success" | "error";
      name: string;
      toolClass: ToolClass;
    }
  | { kind: "approval"; pending: boolean }
  | { kind: "turn"; phase: "done" | "error" }
  | { kind: "emote"; emotion: SpriteEmotion }
  | {
      kind: "travel";
      phase: "start" | "end";
      travelKind: SpriteTravelKind;
      direction: "left" | "right";
    }
  | {
      /** Play a tool performance and report impact/done back to main — the
       *  sync lane for OS actions timed to the animation's hit frame. */
      kind: "perform-sync";
      name: string;
      toolClass: ToolClass;
      nonce: string;
    };
