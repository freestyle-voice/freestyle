import { afterEach, describe, expect, it, vi } from "vitest";

const { child, emit, resetListeners, spawnMock } = vi.hoisted(() => {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  const addListener = (
    event: string,
    listener: (...args: unknown[]) => void,
  ) => {
    const registered = listeners.get(event) ?? [];
    registered.push(listener);
    listeners.set(event, registered);
  };
  const childProcess = {
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn(addListener),
    once: vi.fn(addListener),
    kill: vi.fn(),
  };
  return {
    child: childProcess,
    emit: (event: string, ...args: unknown[]) => {
      for (const listener of listeners.get(event) ?? []) listener(...args);
    },
    resetListeners: () => listeners.clear(),
    spawnMock: vi.fn(() => childProcess),
  };
});

vi.mock("node:child_process", () => ({ spawn: spawnMock }));
vi.mock("./native-binary", () => ({
  getNativeBinaryPath: () => "/tmp/macos-key-listener",
}));

import { NativeKeyListener } from "./key-listener";

afterEach(() => {
  vi.useRealTimers();
  child.kill.mockClear();
  child.on.mockClear();
  child.once.mockClear();
  resetListeners();
  spawnMock.mockClear();
});

describe("NativeKeyListener startup", () => {
  it("stops and reports a listener that never becomes ready", async () => {
    vi.useFakeTimers();
    const errors: string[] = [];
    const listener = new NativeKeyListener({
      hotkey: "Fn",
      onKeyDown: () => {},
      onKeyUp: () => {},
      onError: (error) => errors.push(error),
    });

    const started = listener.start();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
    await expect(started).resolves.toBe(false);
    expect(errors).toContain("Key listener timed out waiting for READY.");
    emit("close", null, "SIGTERM");
  });

  it("kills a listener ignoring SIGTERM and waits for its actual close", async () => {
    vi.useFakeTimers();
    const listener = new NativeKeyListener({
      hotkey: "Fn",
      onKeyDown: () => {},
      onKeyUp: () => {},
    });
    void listener.start();
    let stopped = false;
    const termination = listener.stop();
    expect(listener.stop()).toBe(termination);
    const completed = termination.then(() => {
      stopped = true;
    });
    await vi.advanceTimersByTimeAsync(999);
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(stopped).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(child.kill).toHaveBeenLastCalledWith("SIGKILL");
    expect(stopped).toBe(false);
    emit("close", null, "SIGKILL");
    await completed;
    expect(stopped).toBe(true);
  });

  it("rejects within a bounded deadline if even SIGKILL never closes the child", async () => {
    vi.useFakeTimers();
    const listener = new NativeKeyListener({
      hotkey: "Fn",
      onKeyDown: () => {},
      onKeyUp: () => {},
    });
    void listener.start();
    const failed = expect(listener.stop()).rejects.toThrow(
      "did not exit after SIGKILL",
    );
    await vi.advanceTimersByTimeAsync(2_000);
    await failed;
    expect(child.kill).toHaveBeenLastCalledWith("SIGKILL");
    emit("close", null, "SIGKILL");
  });

  it("waits for the child to exit before allowing a replacement listener", async () => {
    const listener = new NativeKeyListener({
      hotkey: "Fn",
      onKeyDown: () => {},
      onKeyUp: () => {},
    });
    void listener.start();

    let stopped = false;
    const stopping = listener.stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);

    emit("close", 0);
    await stopping;
    expect(child.kill).toHaveBeenCalledWith("SIGTERM");
  });
});
