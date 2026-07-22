import { expect, test } from "@playwright/test";
import { runFactoryResetLifecycle } from "../src/main/factory-reset-lifecycle";
import { HotkeyBindingService } from "../src/main/hotkey-binding-service";
import {
  type HotkeyBindings,
  HotkeyManager,
  type HotkeyManagerDependencies,
  type ManagedHotkeyListener,
  type ManagedHotkeyListenerOptions,
} from "../src/main/hotkey-manager";
import { normalizeAccelerator } from "../src/main/hotkey-utils";
import { acceleratorsEqual } from "../src/shared/hotkey-utils";

class Deferred<T> {
  readonly promise: Promise<T>;
  resolve: (value: T) => void = () => {};

  constructor() {
    this.promise = new Promise<T>((resolve) => {
      this.resolve = resolve;
    });
  }
}

class FakeListener implements ManagedHotkeyListener {
  startCalls = 0;
  stopCalls = 0;
  isRunning = false;

  constructor(
    readonly options: ManagedHotkeyListenerOptions,
    private readonly startResult: boolean | Promise<boolean>,
  ) {}

  async start(): Promise<boolean> {
    this.startCalls++;
    const started = await this.startResult;
    this.isRunning = started;
    return started;
  }

  stop(): void {
    this.stopCalls++;
    this.isRunning = false;
  }
}

interface Harness {
  manager: HotkeyManager;
  listeners: FakeListener[];
  events: string[];
  fallbackCallbacks: Map<string, () => void>;
  fallbackAttempts: string[];
  unregisteredFallbacks: string[];
  holdErrors: string[];
  toggleErrors: string[];
  logs: string[];
  timers: Map<number, () => void>;
}

function createHarness(options?: {
  startResults?: Array<boolean | Promise<boolean>>;
  fallbackResult?: string | null;
}): Harness {
  const listeners: FakeListener[] = [];
  const events: string[] = [];
  const fallbackCallbacks = new Map<string, () => void>();
  const fallbackAttempts: string[] = [];
  const unregisteredFallbacks: string[] = [];
  const holdErrors: string[] = [];
  const toggleErrors: string[] = [];
  const logs: string[] = [];
  const timers = new Map<number, () => void>();
  const startResults = [...(options?.startResults ?? [])];
  let nextTimer = 1;

  const dependencies: HotkeyManagerDependencies = {
    createListener: (listenerOptions) => {
      const listener = new FakeListener(
        listenerOptions,
        startResults.shift() ?? true,
      );
      listeners.push(listener);
      return listener;
    },
    registerFallback: (accelerator, callback) => {
      fallbackAttempts.push(accelerator);
      const registered = options?.fallbackResult ?? accelerator;
      if (registered) fallbackCallbacks.set(registered, callback);
      return registered;
    },
    unregisterFallback: (accelerator) => {
      unregisteredFallbacks.push(accelerator);
      fallbackCallbacks.delete(accelerator);
    },
    sendHotkeyDown: () => events.push("down"),
    sendHotkeyUp: () => events.push("up"),
    surfaceHoldUnavailableError: (accelerator) => holdErrors.push(accelerator),
    surfaceToggleUnavailableError: (accelerator) =>
      toggleErrors.push(accelerator),
    log: (message) => logs.push(message),
    setTimer: (callback) => {
      const timer = nextTimer++;
      timers.set(timer, callback);
      return timer;
    },
    clearTimer: (timer) => {
      timers.delete(timer as number);
    },
  };

  return {
    manager: new HotkeyManager(dependencies),
    listeners,
    events,
    fallbackCallbacks,
    fallbackAttempts,
    unregisteredFallbacks,
    holdErrors,
    toggleErrors,
    logs,
    timers,
  };
}

function listenerFor(
  harness: Harness,
  binding: "hold" | "toggle",
  index = 0,
): FakeListener {
  return harness.listeners.filter(
    (listener) => listener.options.binding === binding,
  )[index];
}

test("HotkeyManager constructs with injected dependencies and empty state", () => {
  const harness = createHarness();

  expect(harness.manager.getState()).toEqual({
    bindings: {
      hold: {
        accelerator: null,
        listener: null,
        fallbackAccelerator: null,
      },
      toggle: {
        accelerator: null,
        listener: null,
        fallbackAccelerator: null,
      },
    },
    generation: 0,
    paused: false,
    destroyed: false,
    recording: {
      active: false,
      holdKeyDown: false,
      startedBy: null,
    },
  });
});

test("distinct bindings start two native listeners concurrently", async () => {
  const holdStart = new Deferred<boolean>();
  const toggleStart = new Deferred<boolean>();
  const harness = createHarness({
    startResults: [holdStart.promise, toggleStart.promise],
  });

  const registration = harness.manager.registerBindings({
    hold: "Control+Alt+Space",
    toggle: "F8",
  });

  expect(harness.listeners).toHaveLength(2);
  expect(harness.listeners.map((listener) => listener.startCalls)).toEqual([
    1, 1,
  ]);
  holdStart.resolve(true);
  toggleStart.resolve(true);
  await registration;

  expect(harness.manager.getState().bindings.hold.listener).not.toBeNull();
  expect(harness.manager.getState().bindings.toggle.listener).not.toBeNull();
});

test("null or empty toggle creates no toggle listener", async () => {
  for (const toggle of [null, ""]) {
    const harness = createHarness();
    await harness.manager.registerBindings({ hold: "F7", toggle });

    expect(harness.listeners).toHaveLength(1);
    expect(harness.manager.getState().bindings.toggle.accelerator).toBeNull();
  }
});

test("canonical duplicate keeps hold and leaves toggle inert", async () => {
  const harness = createHarness();
  await harness.manager.registerBindings({
    hold: "Control+Alt+Space",
    toggle: "Alt+Ctrl+Space",
  });

  expect(harness.listeners).toHaveLength(1);
  expect(harness.manager.getState().bindings.hold.accelerator).toBe(
    "Control+Alt+Space",
  );
  expect(harness.manager.getState().bindings.toggle.accelerator).toBeNull();
  expect(harness.logs).toHaveLength(1);
});

test("hold down and up are synchronous and idempotent", async () => {
  const harness = createHarness();
  await harness.manager.registerBindings({ hold: "F7", toggle: null });
  const hold = listenerFor(harness, "hold");

  hold.options.onKeyUp();
  hold.options.onKeyDown();
  hold.options.onKeyDown();
  hold.options.onKeyUp();
  hold.options.onKeyUp();

  expect(harness.events).toEqual(["down", "up"]);
});

test("toggle alternates recording and ignores key up", async () => {
  const harness = createHarness();
  await harness.manager.registerBindings({ hold: "F7", toggle: "F8" });
  const toggle = listenerFor(harness, "toggle");

  toggle.options.onKeyDown();
  toggle.options.onKeyUp();
  toggle.options.onKeyDown();

  expect(harness.events).toEqual(["down", "up"]);
});

test("either applicable stop condition stops the shared session", async () => {
  const harness = createHarness();
  await harness.manager.registerBindings({ hold: "F7", toggle: "F8" });
  const hold = listenerFor(harness, "hold");
  const toggle = listenerFor(harness, "toggle");

  hold.options.onKeyDown();
  toggle.options.onKeyDown();
  toggle.options.onKeyDown();
  hold.options.onKeyDown();
  hold.options.onKeyUp();

  expect(harness.events).toEqual(["down", "up", "down", "up"]);
});

test("near-simultaneous starts cannot emit overlapping down events", async () => {
  const harness = createHarness();
  await harness.manager.registerBindings({ hold: "F7", toggle: "F8" });

  listenerFor(harness, "hold").options.onKeyDown();
  listenerFor(harness, "toggle").options.onKeyDown();

  expect(harness.events).toEqual(["down", "up"]);
  expect(harness.manager.getState().recording.active).toBe(false);
});

test("re-registration stops both listeners and releases once", async () => {
  const harness = createHarness();
  await harness.manager.registerBindings({ hold: "F7", toggle: "F8" });
  const firstHold = listenerFor(harness, "hold");
  const firstToggle = listenerFor(harness, "toggle");
  firstHold.options.onKeyDown();

  await harness.manager.registerBindings({ hold: "F9", toggle: "F10" });

  expect(firstHold.stopCalls).toBe(1);
  expect(firstToggle.stopCalls).toBe(1);
  expect(harness.events).toEqual(["down", "up"]);
});

test("replacement unregisters only its tracked fallback", async () => {
  const harness = createHarness({ startResults: [true, false, true] });
  await harness.manager.registerBindings({ hold: "F7", toggle: "F8" });

  await harness.manager.registerBindings({ hold: "F9", toggle: null });

  expect(harness.unregisteredFallbacks).toEqual(["F8"]);
});

test("hold startup failure has no fallback and leaves toggle active", async () => {
  const harness = createHarness({ startResults: [false, true] });
  await harness.manager.registerBindings({ hold: "F7", toggle: "F8" });

  expect(harness.fallbackAttempts).toEqual([]);
  expect(harness.holdErrors).toEqual(["F7"]);
  expect(harness.manager.getState().bindings.hold.listener).toBeNull();
  expect(harness.manager.getState().bindings.toggle.listener).not.toBeNull();
});

test("toggle startup failure installs fallback and leaves hold active", async () => {
  const harness = createHarness({ startResults: [true, false] });
  await harness.manager.registerBindings({ hold: "F7", toggle: "F8" });

  expect(harness.fallbackAttempts).toEqual(["F8"]);
  expect(harness.manager.getState().bindings.hold.listener).not.toBeNull();
  expect(harness.manager.getState().bindings.toggle.fallbackAccelerator).toBe(
    "F8",
  );
  harness.fallbackCallbacks.get("F8")?.();
  expect(harness.events).toEqual(["down"]);
});

test("permanent failure only replaces the failing slot", async () => {
  const harness = createHarness();
  await harness.manager.registerBindings({ hold: "F7", toggle: "F8" });
  const hold = listenerFor(harness, "hold");
  const toggle = listenerFor(harness, "toggle");

  toggle.options.onPermanentFailure?.();
  expect(hold.stopCalls).toBe(0);
  expect(harness.manager.getState().bindings.hold.listener).toBe(hold);
  expect(harness.manager.getState().bindings.toggle.listener).toBeNull();
  expect(harness.manager.getState().bindings.toggle.fallbackAccelerator).toBe(
    "F8",
  );

  hold.options.onPermanentFailure?.();
  hold.options.onPermanentFailure?.();
  expect(harness.holdErrors).toEqual(["F7"]);
  expect(harness.manager.getState().bindings.toggle.fallbackAccelerator).toBe(
    "F8",
  );
});

test("stale startup and callbacks cannot mutate the current generation", async () => {
  const oldStart = new Deferred<boolean>();
  const harness = createHarness({ startResults: [oldStart.promise, true] });
  const oldRegistration = harness.manager.registerBindings({
    hold: "F7",
    toggle: null,
  });
  const oldHold = listenerFor(harness, "hold");

  await harness.manager.registerBindings({ hold: "F8", toggle: null });
  const currentHold = listenerFor(harness, "hold", 1);
  oldHold.options.onKeyDown();
  oldHold.options.onPermanentFailure?.();
  oldStart.resolve(true);
  await oldRegistration;

  expect(oldHold.stopCalls).toBeGreaterThan(0);
  expect(harness.events).toEqual([]);
  expect(harness.holdErrors).toEqual([]);
  expect(harness.manager.getState().bindings.hold.listener).toBe(currentHold);
});

test("pause and resume preserve both desired bindings", async () => {
  const harness = createHarness();
  await harness.manager.registerBindings({ hold: "F7", toggle: "F8" });
  const firstHold = listenerFor(harness, "hold");
  const firstToggle = listenerFor(harness, "toggle");

  harness.manager.pause();
  expect(firstHold.stopCalls).toBe(1);
  expect(firstToggle.stopCalls).toBe(1);
  expect(harness.manager.getDesiredBindings()).toEqual({
    hold: "F7",
    toggle: "F8",
  });

  await harness.manager.resume();
  expect(harness.listeners).toHaveLength(4);
  expect(harness.manager.getState().paused).toBe(false);
});

test("hold watchdog forces one release and clears physical state", async () => {
  const harness = createHarness();
  await harness.manager.registerBindings({ hold: "F7", toggle: null });
  listenerFor(harness, "hold").options.onKeyDown();
  const watchdog = [...harness.timers.values()][0];

  watchdog();

  expect(harness.events).toEqual(["down", "up"]);
  expect(harness.manager.getState().recording).toEqual({
    active: false,
    holdKeyDown: false,
    startedBy: null,
  });
});

test("watchdog and final stop clean all owned state", async () => {
  const harness = createHarness({ startResults: [true, false] });
  await harness.manager.registerBindings({ hold: "F7", toggle: "F8" });
  listenerFor(harness, "hold").options.onKeyDown();
  expect(harness.timers.size).toBe(1);

  harness.manager.stop();

  expect(harness.events).toEqual(["down", "up"]);
  expect(harness.timers.size).toBe(0);
  expect(harness.unregisteredFallbacks).toEqual(["F8"]);
  expect(harness.manager.getState().destroyed).toBe(true);
  expect(harness.manager.getState().bindings.hold.listener).toBeNull();
  expect(harness.manager.getState().bindings.toggle.listener).toBeNull();

  harness.manager.stop();
  expect(harness.events).toEqual(["down", "up"]);
  expect(harness.unregisteredFallbacks).toEqual(["F8"]);
  expect(listenerFor(harness, "hold").stopCalls).toBe(1);
});

test("factory reset pauses during work and permanently stops before relaunch", async () => {
  const harness = createHarness();
  await harness.manager.registerBindings({ hold: "F7", toggle: "F8" });
  listenerFor(harness, "hold").options.onKeyDown();
  const lifecycle: string[] = [];

  await runFactoryResetLifecycle({
    manager: harness.manager,
    performReset: async () => {
      lifecycle.push("reset");
      expect(harness.manager.getState().paused).toBe(true);
      expect(harness.manager.getState().destroyed).toBe(false);
      expect(harness.manager.getDesiredBindings()).toEqual({
        hold: "F7",
        toggle: "F8",
      });
      expect(harness.events).toEqual(["down", "up"]);
    },
    scheduleRelaunch: () => {
      lifecycle.push("relaunch");
      expect(harness.manager.getState().destroyed).toBe(true);
    },
    exit: () => {
      lifecycle.push("exit");
      expect(harness.manager.getState().destroyed).toBe(true);
    },
    logResumeFailure: () => {},
  });

  expect(lifecycle).toEqual(["reset", "relaunch", "exit"]);
  expect(harness.manager.getState().destroyed).toBe(true);
});

test("factory reset failure resumes preserved bindings and rethrows the original error", async () => {
  const harness = createHarness();
  await harness.manager.registerBindings({ hold: "F7", toggle: "F8" });
  const resetError = new Error("reset failed");

  await expect(
    runFactoryResetLifecycle({
      manager: harness.manager,
      performReset: async () => {
        expect(harness.manager.getState().paused).toBe(true);
        throw resetError;
      },
      scheduleRelaunch: () => {
        throw new Error("must not relaunch");
      },
      exit: () => {
        throw new Error("must not exit");
      },
      logResumeFailure: () => {},
    }),
  ).rejects.toBe(resetError);

  expect(harness.manager.getState().destroyed).toBe(false);
  expect(harness.manager.getState().paused).toBe(false);
  expect(harness.manager.getDesiredBindings()).toEqual({
    hold: "F7",
    toggle: "F8",
  });
  expect(harness.listeners).toHaveLength(4);
});

test("factory reset recovery logs resume failure without hiding the reset error", async () => {
  const harness = createHarness();
  await harness.manager.registerBindings({ hold: "F7", toggle: "F8" });
  const resetError = new Error("reset failed");
  const resumeError = new Error("resume failed");
  const loggedErrors: unknown[] = [];
  harness.manager.resume = async () => {
    throw resumeError;
  };

  await expect(
    runFactoryResetLifecycle({
      manager: harness.manager,
      performReset: async () => {
        throw resetError;
      },
      scheduleRelaunch: () => {},
      exit: () => {},
      logResumeFailure: (error) => loggedErrors.push(error),
    }),
  ).rejects.toBe(resetError);

  expect(loggedErrors).toEqual([resumeError]);
  expect(harness.manager.getState().destroyed).toBe(false);
  expect(harness.manager.getState().paused).toBe(true);
  expect(harness.manager.getDesiredBindings()).toEqual({
    hold: "F7",
    toggle: "F8",
  });
});

function createBindingServiceHarness(options?: {
  register?: (bindings: HotkeyBindings) => Promise<void>;
  acceleratorsEqual?: (a: string, b: string) => boolean;
}) {
  const persisted: { hold: string; toggle: string | null } = {
    hold: "Control+Alt+Space",
    toggle: "Control+Shift+Space",
  };
  const writes: Array<{ kind: "hold" | "toggle"; value: string | null }> = [];
  const registrations: HotkeyBindings[] = [];
  const recoveryLogs: string[] = [];
  let paused = false;
  let resumeCalls = 0;

  const service = new HotkeyBindingService({
    readPersistedBinding: (kind) => persisted[kind],
    persistBinding: (kind, value) => {
      writes.push({ kind, value });
      if (kind === "hold") persisted.hold = value!;
      else persisted.toggle = value;
    },
    registerBindings: async (bindings) => {
      registrations.push({ ...bindings });
      await options?.register?.(bindings);
    },
    resumeIfPaused: async () => {
      if (paused) {
        resumeCalls++;
        paused = false;
      }
    },
    validateAccelerator: (accelerator) => accelerator.includes("+"),
    normalizeAccelerator,
    acceleratorsEqual: options?.acceleratorsEqual ?? acceleratorsEqual,
    defaultHold: "Control+Alt+Space",
    logRecoveryFailure: (message) => recoveryLogs.push(message),
  });

  return {
    service,
    persisted,
    writes,
    registrations,
    recoveryLogs,
    setPaused: (value: boolean) => {
      paused = value;
    },
    getResumeCalls: () => resumeCalls,
  };
}

test("binding saves update one slot while preserving the opposite slot", async () => {
  const harness = createBindingServiceHarness();

  const hold = await harness.service.setBinding("hold", "Ctrl+Alt+Return");
  expect(hold).toEqual({ ok: true, accelerator: "Control+Alt+Return" });
  expect(harness.persisted).toEqual({
    hold: "Control+Alt+Return",
    toggle: "Control+Shift+Space",
  });

  const toggle = await harness.service.setBinding(
    "toggle",
    "Control+Shift+Return",
  );
  expect(toggle).toEqual({
    ok: true,
    accelerator: "Control+Shift+Return",
  });
  expect(harness.persisted).toEqual({
    hold: "Control+Alt+Return",
    toggle: "Control+Shift+Return",
  });
});

test("binding saves clear toggle but reject clearing hold", async () => {
  const harness = createBindingServiceHarness();

  expect(await harness.service.setBinding("toggle", null)).toEqual({
    ok: true,
    accelerator: null,
  });
  expect(harness.persisted.toggle).toBeNull();

  const writesBefore = harness.writes.length;
  expect(await harness.service.setBinding("hold", null)).toEqual({
    ok: false,
    error: "hold_required",
  });
  expect(harness.writes).toHaveLength(writesBefore);
  expect(harness.persisted.hold).toBe("Control+Alt+Space");
});

test("binding saves reject canonical duplicates in either direction", async () => {
  const harness = createBindingServiceHarness();
  harness.setPaused(true);

  expect(await harness.service.setBinding("toggle", "Alt+Ctrl+Space")).toEqual({
    ok: false,
    conflictingKind: "hold",
  });
  expect(await harness.service.setBinding("hold", "Shift+Ctrl+Space")).toEqual({
    ok: false,
    conflictingKind: "toggle",
  });
  expect(harness.writes).toEqual([]);
  expect(harness.registrations).toEqual([]);
  expect(harness.getResumeCalls()).toBe(1);
});

test("failed runtime registration rolls persistence and runtime back", async () => {
  let calls = 0;
  const harness = createBindingServiceHarness({
    register: async () => {
      calls++;
      if (calls === 1) throw new Error("registration failed");
    },
  });

  expect(
    await harness.service.setBinding("toggle", "Control+Shift+Return"),
  ).toEqual({ ok: false, error: "save_failed" });
  expect(harness.persisted).toEqual({
    hold: "Control+Alt+Space",
    toggle: "Control+Shift+Space",
  });
  expect(harness.registrations).toEqual([
    {
      hold: "Control+Alt+Space",
      toggle: "Control+Shift+Return",
    },
    {
      hold: "Control+Alt+Space",
      toggle: "Control+Shift+Space",
    },
  ]);
  expect(harness.recoveryLogs).toContain("Failed to save hotkey binding");
});

test("simultaneous binding saves are serialized", async () => {
  const firstRegistration = new Deferred<void>();
  let calls = 0;
  const harness = createBindingServiceHarness({
    register: async () => {
      calls++;
      if (calls === 1) await firstRegistration.promise;
    },
  });

  const holdSave = harness.service.setBinding("hold", "Control+Alt+Return");
  const toggleSave = harness.service.setBinding(
    "toggle",
    "Control+Shift+Return",
  );
  await expect.poll(() => harness.writes.length).toBe(1);
  expect(harness.writes[0]).toEqual({
    kind: "hold",
    value: "Control+Alt+Return",
  });

  firstRegistration.resolve();
  await expect(holdSave).resolves.toEqual({
    ok: true,
    accelerator: "Control+Alt+Return",
  });
  await expect(toggleSave).resolves.toEqual({
    ok: true,
    accelerator: "Control+Shift+Return",
  });
  expect(harness.registrations[1]).toEqual({
    hold: "Control+Alt+Return",
    toggle: "Control+Shift+Return",
  });
});

test("an unexpectedly rejected save does not poison later serialized saves", async () => {
  let comparisons = 0;
  const harness = createBindingServiceHarness({
    acceleratorsEqual: (a, b) => {
      comparisons++;
      if (comparisons === 1) throw new Error("unexpected comparison failure");
      return acceleratorsEqual(a, b);
    },
  });

  await expect(
    harness.service.setBinding("hold", "Control+Alt+Return"),
  ).rejects.toThrow("unexpected comparison failure");
  await expect(
    harness.service.setBinding("toggle", "Control+Shift+Return"),
  ).resolves.toEqual({
    ok: true,
    accelerator: "Control+Shift+Return",
  });
});
