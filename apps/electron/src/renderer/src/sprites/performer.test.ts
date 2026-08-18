import { expect, test, vi } from "vitest";
import { JEB_MANIFEST } from "../assets/jeb/manifest";
import type { SheetEngine } from "./engine";
import { Performer } from "./performer";
import type { SheetSpriteDefinition } from "./types";

const def = {
  id: "test",
  label: "Test",
  kind: "sheet",
  windowSize: 96,
  anchor: null,
  body: { x: 0, y: 0, width: 1, height: 1 },
  hotRect: { x: 0, y: 0, width: 1, height: 1 },
  bubble: { x: 0, y: 0, maxChars: 1 },
  manifest: {
    frameSize: 1,
    scale: 1,
    states: {
      idle: { sheet: "idle.png", frames: 1, fps: 1, loop: true },
      typing: { sheet: "typing.png", frames: 1, fps: 1, loop: true },
    },
  },
  sheets: {},
  timings: { sleepAfterMs: 10_000, microMinMs: 60_000, microMaxMs: 60_000 },
  choreography: {
    tool: { byName: {}, byClass: {} },
    emote: {},
    ambients: { thinking: "typing" },
  },
} as SheetSpriteDefinition;

test("does not log sprite events", () => {
  const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
  const engine = {
    ambient: "idle",
    busy: false,
    setAmbient: vi.fn(),
    playSequence: vi.fn(),
  } as unknown as SheetEngine;
  const performer = new Performer(engine, def, false);

  performer.handle({ kind: "thinking", on: true });

  expect(debug).not.toHaveBeenCalled();

  performer.destroy();
  debug.mockRestore();
});

test("Jeb's manifest provides the fall-only portion of the death sheet", () => {
  expect(JEB_MANIFEST.states["death-fall"]).toMatchObject({
    sheet: "death.png",
    start: 4,
    frames: 5,
    fps: 10,
    loop: false,
    holdLast: true,
  });
});
