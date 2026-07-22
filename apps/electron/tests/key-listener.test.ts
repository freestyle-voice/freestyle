import { expect, test } from "@playwright/test";
import { HotkeyRecorder } from "../src/main/hotkey-recorder";
import { NativeKeyListener } from "../src/main/key-listener";

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
  const recorder = new HotkeyRecorder("hold", {
    onModifiers: (nextModifiers) => modifiers.push(nextModifiers),
    onCaptured: () => {},
    onCancel: () => {},
  }) as unknown as LineHandler;

  recorder.handleLine("FN_DOWN:control,option,shift,command");

  expect(modifiers).toEqual([["Control", "Alt", "Shift", "Command", "Fn"]]);
});

test("hotkey recorder events carry the active binding kind", () => {
  const sent: Array<{ channel: string; payload: unknown }> = [];
  const recorder = new HotkeyRecorder("toggle", {
    onModifiers: () => {},
    onCaptured: () => {},
    onCancel: () => {},
  }) as unknown as LineHandler & {
    target: { send: (channel: string, payload: unknown) => void };
  };
  recorder.target = {
    send: (channel, payload) => sent.push({ channel, payload }),
  };

  recorder.handleLine("RECORD_MODIFIERS:Control,Alt");
  recorder.handleLine("RECORD_KEY:Space");
  recorder.handleLine("RECORD_RELEASE");

  expect(sent).toEqual([
    {
      channel: "hotkey-record:modifiers",
      payload: { kind: "toggle", modifiers: ["Control", "Alt"] },
    },
    {
      channel: "hotkey-record:captured",
      payload: {
        kind: "toggle",
        combo: { modifiers: ["Control", "Alt"], key: "Space" },
      },
    },
    { channel: "hotkey-record:released", payload: { kind: "toggle" } },
  ]);
});

test("hotkey recorder reports a start failure once per session", () => {
  const errors: string[] = [];
  const recorder = new HotkeyRecorder("hold", {
    onModifiers: () => {},
    onCaptured: () => {},
    onCancel: () => {},
    onError: (message) => errors.push(message),
  }) as HotkeyRecorder & {
    reportTerminalError(message: string): void;
  };
  const currentPlatform = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", {
    configurable: true,
    value: "unsupported",
  });
  try {
    expect(recorder.start({ send: () => {} } as never)).toBe(false);
    recorder.reportTerminalError("duplicate recovery");
  } finally {
    if (currentPlatform) {
      Object.defineProperty(process, "platform", currentPlatform);
    }
  }

  expect(errors).toEqual(["Unsupported platform: unsupported"]);
});

test("hotkey recorder cancel completes once", () => {
  let cancelCalls = 0;
  const recorder = new HotkeyRecorder("toggle", {
    onModifiers: () => {},
    onCaptured: () => {},
    onCancel: () => cancelCalls++,
  }) as unknown as LineHandler & {
    target: { send: () => void };
  };
  recorder.target = { send: () => {} };

  recorder.handleLine("RECORD_CANCEL");
  recorder.handleLine("RECORD_CANCEL");

  expect(cancelCalls).toBe(1);
});
