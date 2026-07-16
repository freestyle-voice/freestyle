import { expect, test } from "@playwright/test";
import { HotkeyRecorder } from "../src/main/hotkey-recorder";
import { NativeKeyListener } from "../src/main/key-listener";
import {
  comboToAccelerator,
  isValidHotkeyCombo,
  nextRightModifierLatch,
} from "../src/renderer/src/hooks/use-hotkey-recorder";

type LineHandler = {
  handleLine(line: string): void;
};

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const platformDescriptor = Object.getOwnPropertyDescriptor(process, "platform");

test.beforeAll(() => {
  Object.defineProperty(process, "platform", {
    configurable: true,
    value: "darwin",
  });
});

test.afterAll(() => {
  if (platformDescriptor) {
    Object.defineProperty(process, "platform", platformDescriptor);
  }
});

function createFnListener(): {
  listener: LineHandler;
  events: string[];
} {
  const events: string[] = [];
  const listener = new NativeKeyListener({
    hotkey: "Fn",
    onKeyDown: () => events.push("down"),
    onKeyUp: () => events.push("up"),
  }) as unknown as LineHandler;

  return { listener, events };
}

test("solo Fn hotkey activates after the chord grace window", async () => {
  const { listener, events } = createFnListener();

  listener.handleLine("FN_DOWN");
  expect(events).toEqual([]);

  await wait(75);
  expect(events).toEqual(["down"]);

  listener.handleLine("FN_UP");
  expect(events).toEqual(["down", "up"]);
});

test("modifier-first Fn chord does not activate a solo Fn hotkey", async () => {
  const { listener, events } = createFnListener();

  listener.handleLine("FN_DOWN:command");
  await wait(75);
  listener.handleLine("FN_UP");

  expect(events).toEqual([]);
});

test("Fn-first chord within the grace window does not activate solo Fn", async () => {
  const { listener, events } = createFnListener();

  listener.handleLine("FN_DOWN");
  listener.handleLine("FLAGS:command");
  await wait(75);
  listener.handleLine("FN_UP");

  expect(events).toEqual([]);
});

test("rapid solo Fn release inside the grace window does not activate", async () => {
  const { listener, events } = createFnListener();

  listener.handleLine("FN_DOWN");
  listener.handleLine("FN_UP");
  await wait(75);

  expect(events).toEqual([]);
});

test("adding a modifier after solo Fn activation keeps hold-to-talk active", async () => {
  const { listener, events } = createFnListener();

  listener.handleLine("FN_DOWN");
  await wait(75);
  listener.handleLine("FLAGS:command");
  listener.handleLine("FN_UP");

  expect(events).toEqual(["down", "up"]);
});

test("hotkey recorder preserves modifiers emitted with Fn chord lines", () => {
  const modifiers: string[][] = [];
  const recorder = new HotkeyRecorder({
    onModifiers: (nextModifiers) => modifiers.push(nextModifiers),
    onCaptured: () => {},
    onCancel: () => {},
  }) as unknown as LineHandler;

  recorder.handleLine("FN_DOWN:control,option,shift,command");

  expect(modifiers).toEqual([["Control", "Alt", "Shift", "Command", "Fn"]]);
});

test("hotkey recorder preserves the side-specific token for a right modifier press", () => {
  const modifiers: string[][] = [];
  const recorder = new HotkeyRecorder({
    onModifiers: (nextModifiers) => modifiers.push(nextModifiers),
    onCaptured: () => {},
    onCancel: () => {},
  }) as unknown as LineHandler;

  recorder.handleLine("RIGHT_MOD_DOWN:RightCommand");

  expect(modifiers).toEqual([["RightCommand"]]);
});

test("NativeKeyListener with hotkey RightCommand ignores the generic FLAGS event", async () => {
  const events: string[] = [];
  const listener = new NativeKeyListener({
    hotkey: "RightCommand",
    onKeyDown: () => events.push("down"),
    onKeyUp: () => events.push("up"),
  }) as unknown as LineHandler;

  listener.handleLine("FLAGS:command");
  expect(events).toEqual([]);

  listener.handleLine("RIGHT_MOD_DOWN:RightCommand");
  expect(events).toEqual(["down"]);

  listener.handleLine("RIGHT_MOD_UP:RightCommand");
  expect(events).toEqual(["down", "up"]);

  // Self-generated paste synthesizes a generic Command flag; must not re-fire.
  listener.handleLine("FLAGS:command");
  expect(events).toEqual(["down", "up"]);
});

test("NativeKeyListener with hotkey Command still fires on the generic FLAGS event (regression)", () => {
  const events: string[] = [];
  const listener = new NativeKeyListener({
    hotkey: "Command",
    onKeyDown: () => events.push("down"),
    onKeyUp: () => events.push("up"),
  }) as unknown as LineHandler;

  listener.handleLine("FLAGS:command");
  expect(events).toEqual(["down"]);
});

test("comboToAccelerator serializes a bare side-specific modifier combo", () => {
  expect(comboToAccelerator({ modifiers: [], key: "RightCommand" })).toBe(
    "RightCommand",
  );
});

test("isValidHotkeyCombo accepts a bare side-specific modifier combo", () => {
  expect(isValidHotkeyCombo({ modifiers: [], key: "RightCommand" })).toBe(true);
});

test("nextRightModifierLatch latches a lone right modifier on an empty draft", () => {
  const latch = nextRightModifierLatch(
    null,
    { modifiers: [], key: null },
    {
      rightToken: "RightCommand",
      modifierCount: 1,
      genericModifiers: ["Command"],
    },
  );
  expect(latch).toBe("RightCommand");
});

test("nextRightModifierLatch clears when a second modifier joins the chord", () => {
  const latch = nextRightModifierLatch(
    "RightCommand",
    { modifiers: ["Command"], key: null },
    {
      rightToken: null,
      modifierCount: 2,
      genericModifiers: ["Command", "Shift"],
    },
  );
  expect(latch).toBeNull();
});

test("nextRightModifierLatch clears on a generic (non-right) modifier update", () => {
  const latch = nextRightModifierLatch(
    null,
    { modifiers: [], key: null },
    { rightToken: null, modifierCount: 1, genericModifiers: ["Shift"] },
  );
  expect(latch).toBeNull();
});

test("nextRightModifierLatch survives a duplicate delivery of the same right modifier", () => {
  // Native RIGHT_MOD_DOWN already latched and merged "Command" into the draft;
  // the DOM listener then fires for the same physical key press.
  const latch = nextRightModifierLatch(
    "RightCommand",
    { modifiers: ["Command"], key: null },
    {
      rightToken: "RightCommand",
      modifierCount: 1,
      genericModifiers: ["Command"],
    },
  );
  expect(latch).toBe("RightCommand");
});

test("nextRightModifierLatch does not latch a right modifier when the draft is not empty", () => {
  const latch = nextRightModifierLatch(
    null,
    { modifiers: ["Shift"], key: null },
    {
      rightToken: "RightCommand",
      modifierCount: 1,
      genericModifiers: ["Command"],
    },
  );
  expect(latch).toBeNull();
});

test("nextRightModifierLatch survives the native RIGHT_MOD_DOWN followed by its trailing generic FLAGS emission", () => {
  // macos-key-listener.swift emits RIGHT_MOD_DOWN:RightCommand then FLAGS:command
  // from the SAME flagsChanged callback (rightModifiers loop runs before the
  // flags-diff block unconditionally calls emitFlags). The trailing generic
  // update must not clear the latch it just set.
  let latch = nextRightModifierLatch(
    null,
    { modifiers: [], key: null },
    {
      rightToken: "RightCommand",
      modifierCount: 1,
      genericModifiers: ["Command"],
    },
  );
  expect(latch).toBe("RightCommand");

  latch = nextRightModifierLatch(
    latch,
    { modifiers: ["Command"], key: null },
    { rightToken: null, modifierCount: 1, genericModifiers: ["Command"] },
  );
  expect(latch).toBe("RightCommand");
});

test("nextRightModifierLatch clears when the DOM event explicitly identifies a left-side key", () => {
  const latch = nextRightModifierLatch(
    "RightCommand",
    { modifiers: ["Command"], key: null },
    {
      rightToken: null,
      modifierCount: 1,
      genericModifiers: ["Command"],
      explicitLeft: true,
    },
  );
  expect(latch).toBeNull();
});

test("nextRightModifierLatch clears when a chord forms even if it maps back through the latched generic key", () => {
  const latch = nextRightModifierLatch(
    "RightCommand",
    { modifiers: ["Command"], key: null },
    {
      rightToken: null,
      modifierCount: 2,
      genericModifiers: ["Command", "Shift"],
    },
  );
  expect(latch).toBeNull();
});

test("nextRightModifierLatch does not latch when a right token arrives after a left modifier is already in the draft", () => {
  const latch = nextRightModifierLatch(
    null,
    { modifiers: ["Command"], key: null },
    {
      rightToken: "RightCommand",
      modifierCount: 1,
      genericModifiers: ["Command"],
    },
  );
  expect(latch).toBeNull();
});
