import { SPRITES_INFO } from "@shared/sprites";
import { JEB_MANIFEST } from "../../assets/jeb/manifest";
import type { SheetSpriteDefinition } from "../types";

const SHEET_URLS = import.meta.glob("../../assets/jeb/*.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const sheets: Record<string, string> = {};
for (const [path, url] of Object.entries(SHEET_URLS)) {
  sheets[path.slice(path.lastIndexOf("/") + 1)] = url;
}

/**
 * Samurai Jeb. Every one of his 22 sheets has a live trigger: signature
 * moves per tool name, class moves for everything else, a study pose for
 * reads, a held guard while approvals wait, a flourish when the turn lands,
 * and the wall/jump sheets seasoning his idle-time micro pool.
 */
export const JEB: SheetSpriteDefinition = {
  ...SPRITES_INFO.jeb,
  kind: "sheet",
  manifest: JEB_MANIFEST,
  sheets,
  // Body measured from the frames' alpha at 2x: x 100–144, y 150–218.
  hotRect: { x: 100, y: 150, width: 44, height: 68 },
  bubble: { x: 106, y: 116, maxChars: 80 },
  fx: {
    shuriken: {
      sheet: "shuriken.png",
      size: 24,
      speed: 520,
      spin: 18,
      origin: { x: 126, y: 170 },
    },
  },
  timings: { sleepAfterMs: 10_000, microMinMs: 45_000, microMaxMs: 120_000 },
  choreography: {
    tool: {
      byName: {
        web_search: [{ state: "throw", fx: "shuriken", fxAngle: -15 }],
        image_search: [{ state: "throw", fx: "shuriken", fxAngle: -55 }],
        Edit: [{ state: "attack-3" }],
        brain_edit: [{ state: "attack-3" }],
        Bash: [{ state: "special-attack" }],
      },
      byClass: {
        search: [{ state: "climbing", loops: 2 }, { state: "jump-fall" }],
        read: [{ state: "defend", holdMs: 350 }],
        write: [{ state: "attack-2" }, { state: "jump-fall" }],
        execute: [{ state: "special-attack" }],
        deliver: [{ state: "attack-1" }],
      },
      default: [{ state: "attack-1" }],
    },
    toolError: [{ state: "hurt" }],
    approvalHold: "defend",
    turnDone: [{ state: "air-attack" }],
    turnError: [{ state: "hurt" }, { state: "healing-no-effect" }],
    emote: {
      proud: [{ state: "air-attack" }],
      confused: [{ state: "healing-no-effect" }],
      alarmed: [{ state: "defend", holdMs: 600 }],
      sorry: [{ state: "hurt" }],
    },
    // Working = seated at his laptop; he sits down when a turn starts and
    // stands back up when it lands.
    ambients: { thinking: "typing", listening: "idle" },
    thinkingEnter: [{ state: "typing-start" }],
    thinkingExit: [{ state: "typing-start", reverse: true, fpsScale: 1.6 }],
    sleep: { enter: [{ state: "death" }], ambient: "death" },
    // Getting up: the fall, backwards, fast — then a hop to attention.
    wake: [
      { state: "death", reverse: true, fpsScale: 2 },
      { state: "jump-start" },
    ],
    micro: [
      [
        { state: "walk", loops: 2, face: "left" },
        { state: "walk", loops: 2, face: "right" },
      ],
      [
        { state: "run", loops: 2, face: "left" },
        { state: "run", loops: 2, face: "right" },
      ],
      [{ state: "defend", holdMs: 400 }],
      [{ state: "attack-1" }],
      [{ state: "dash", loops: 1 }],
      [{ state: "healing", loops: 2 }],
      [
        { state: "jump-start" },
        { state: "jump" },
        { state: "jump-transition" },
        { state: "jump-fall" },
      ],
      [
        { state: "wall-contact" },
        { state: "wall-slide", loops: 2 },
        { state: "wall-jump" },
        { state: "jump-fall" },
      ],
    ],
  },
};
