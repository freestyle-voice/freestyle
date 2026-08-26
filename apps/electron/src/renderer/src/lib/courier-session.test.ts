import { afterEach, describe, expect, it, vi } from "vitest";
import {
  COURIER_TOKEN_REFRESH_MS,
  CourierSessionManager,
  SIGNED_OUT_RETRY_MS,
} from "./courier-session";

afterEach(() => {
  vi.useRealTimers();
});

describe("CourierSessionManager", () => {
  it("signs in and refreshes the short-lived Courier JWT before it expires", async () => {
    vi.useFakeTimers();
    const load = vi
      .fn()
      .mockResolvedValueOnce({
        status: "ready",
        userId: "user-1",
        token: "jwt-1",
      })
      .mockResolvedValueOnce({
        status: "ready",
        userId: "user-1",
        token: "jwt-2",
      });
    const onSession = vi.fn(async () => {});
    const manager = new CourierSessionManager({ load, onSession });

    manager.start();
    await vi.waitFor(() => expect(onSession).toHaveBeenCalledTimes(1));
    expect(onSession).toHaveBeenLastCalledWith({
      userId: "user-1",
      token: "jwt-1",
    });

    await vi.advanceTimersByTimeAsync(COURIER_TOKEN_REFRESH_MS);

    expect(onSession).toHaveBeenLastCalledWith({
      userId: "user-1",
      token: "jwt-2",
    });
    manager.stop();
  });

  it("signs out locally and retries without contacting Courier while Cloud auth is absent", async () => {
    vi.useFakeTimers();
    const load = vi
      .fn()
      .mockResolvedValueOnce({ status: "signed-out" })
      .mockResolvedValueOnce({
        status: "ready",
        userId: "user-1",
        token: "jwt-1",
      });
    const onSession = vi.fn(async () => {});
    const onSignedOut = vi.fn();
    const manager = new CourierSessionManager({
      load,
      onSession,
      onSignedOut,
    });

    manager.start();
    await vi.waitFor(() => expect(onSignedOut).toHaveBeenCalledOnce());
    expect(onSession).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(SIGNED_OUT_RETRY_MS);

    expect(onSession).toHaveBeenCalledWith({
      userId: "user-1",
      token: "jwt-1",
    });
    manager.stop();
  });

  it("ignores an in-flight token response after stop", async () => {
    let resolve!: (value: {
      status: "ready";
      userId: string;
      token: string;
    }) => void;
    const load = vi.fn(
      () =>
        new Promise<{ status: "ready"; userId: string; token: string }>(
          (next) => {
            resolve = next;
          },
        ),
    );
    const onSession = vi.fn(async () => {});
    const manager = new CourierSessionManager({ load, onSession });

    manager.start();
    manager.stop();
    resolve({ status: "ready", userId: "user-1", token: "jwt" });
    await Promise.resolve();

    expect(onSession).not.toHaveBeenCalled();
  });

  it("serializes an auth-change refresh behind an in-flight Courier sign-in", async () => {
    let finishFirstSignIn!: () => void;
    const load = vi
      .fn()
      .mockResolvedValueOnce({
        status: "ready",
        userId: "user-1",
        token: "jwt-1",
      })
      .mockResolvedValueOnce({
        status: "ready",
        userId: "user-1",
        token: "jwt-2",
      });
    const onSession = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            finishFirstSignIn = resolve;
          }),
      )
      .mockResolvedValueOnce(undefined);
    const manager = new CourierSessionManager({ load, onSession });

    manager.start();
    await vi.waitFor(() => expect(onSession).toHaveBeenCalledOnce());
    manager.refresh();

    expect(load).toHaveBeenCalledOnce();
    finishFirstSignIn();
    await vi.waitFor(() => expect(onSession).toHaveBeenCalledTimes(2));
    expect(onSession).toHaveBeenLastCalledWith({
      userId: "user-1",
      token: "jwt-2",
    });
    manager.stop();
  });
});
