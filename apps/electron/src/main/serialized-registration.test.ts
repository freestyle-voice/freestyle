import { describe, expect, it, vi } from "vitest";
import { SerializedRegistration } from "./serialized-registration";

describe("SerializedRegistration", () => {
  it("waits for teardown before running the latest requested registration", async () => {
    let finishFirst: (() => void) | undefined;
    const firstRun = new Promise<void>((resolve) => {
      finishFirst = resolve;
    });
    const run = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => firstRun)
      .mockResolvedValue(undefined);
    const coordinator = new SerializedRegistration(run, vi.fn());

    coordinator.schedule();
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    expect(coordinator.isActive).toBe(true);
    coordinator.schedule();
    coordinator.schedule();

    expect(run).toHaveBeenCalledTimes(1);
    finishFirst?.();
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(coordinator.isActive).toBe(false));
  });

  it("does not run queued work after shutdown", async () => {
    let finishFirst: (() => void) | undefined;
    const firstRun = new Promise<void>((resolve) => {
      finishFirst = resolve;
    });
    const run = vi
      .fn<() => Promise<void>>()
      .mockImplementationOnce(() => firstRun)
      .mockResolvedValue(undefined);
    const coordinator = new SerializedRegistration(run, vi.fn());

    coordinator.schedule();
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(1));
    coordinator.schedule();
    coordinator.shutdown();
    finishFirst?.();

    await Promise.resolve();
    expect(run).toHaveBeenCalledTimes(1);
  });
});
