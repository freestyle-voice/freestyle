import { readFile } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";
import { boundedQuitCleanup } from "./quit-cleanup";

afterEach(() => vi.useRealTimers());

describe("quit cleanup", () => {
  it("waits for cleanup and clears the deadline", async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    const cleanup = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const waiting = boundedQuitCleanup(cleanup);
    let done = false;
    void waiting.then(() => {
      done = true;
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(done).toBe(false);
    finish();
    await waiting;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("allows the quit continuation to run even when startup never settles", async () => {
    vi.useFakeTimers();
    const quit = vi.fn();
    const waiting = boundedQuitCleanup(new Promise<void>(() => {}))
      .catch(() => {})
      .finally(quit);
    await vi.advanceTimersByTimeAsync(25_000);
    await waiting;
    expect(quit).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("uses awaited owned teardown for quit, update, and factory reset", async () => {
    const source = await readFile(
      new URL("./index.ts", import.meta.url),
      "utf8",
    );
    expect(source).toContain("await running.stop();");
    expect(source).toContain("await stopOwnedServer();");
    expect(
      source.match(/boundedQuitCleanup\(cleanupBeforeQuit\(\)\)/g),
    ).toHaveLength(2);
    expect(source).toContain(".finally(() => app.exit(0))");
    expect(source).not.toContain("disposeServerPlugins");
    expect(source).not.toContain("httpServer.close()");
  });
});
