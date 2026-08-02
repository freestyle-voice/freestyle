import { afterEach, describe, expect, it, vi } from "vitest";
import { FreestyleCloudAuthError } from "../src/lib/freestyle-cloud.js";
import {
  resetSessionValidationThrottle,
  validateSession,
} from "../src/lib/session-validate.js";
import { clearSession, getSession, setSession } from "../src/lib/sessions.js";

vi.mock("../src/lib/freestyle-cloud.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/lib/freestyle-cloud.js")>();
  return {
    ...actual,
    fetchCloudUser: vi.fn(async () => ({
      id: "user_1",
      email: "user@example.com",
      name: "Fresh Name",
      image: null,
    })),
  };
});

const cloud = await import("../src/lib/freestyle-cloud.js");

const HOST = "https://service.freestylevoice.com";

function signIn(): void {
  setSession({
    token: "token",
    expiresAt: Date.now() + 5 * 24 * 60 * 60 * 1000,
    issuedAt: Date.now(),
    user: { id: "user_1", email: "user@example.com", name: "Cached Name" },
    host: HOST,
  });
}

afterEach(() => {
  clearSession();
  resetSessionValidationThrottle();
  vi.clearAllMocks();
});

describe("validateSession", () => {
  it("reports signed-out without a cloud call when there is no session", async () => {
    await expect(validateSession()).resolves.toEqual({
      user: null,
      verified: true,
    });
    expect(cloud.fetchCloudUser).not.toHaveBeenCalled();
  });

  it("verifies the token against the cloud and mirrors the fresh profile", async () => {
    signIn();
    const result = await validateSession();

    expect(cloud.fetchCloudUser).toHaveBeenCalledWith("token");
    expect(result.verified).toBe(true);
    expect(result.user?.name).toBe("Fresh Name");
    expect(getSession()?.user.name).toBe("Fresh Name");
    expect(getSession()?.token).toBe("token");
  });

  it("throttles repeated cloud round-trips", async () => {
    signIn();
    await validateSession();
    const second = await validateSession();

    expect(cloud.fetchCloudUser).toHaveBeenCalledTimes(1);
    expect(second).toEqual({
      user: expect.objectContaining({ id: "user_1" }),
      verified: true,
    });
  });

  it("drops the session when the cloud rejects the token (401)", async () => {
    signIn();
    vi.mocked(cloud.fetchCloudUser).mockRejectedValueOnce(
      new FreestyleCloudAuthError(),
    );

    await expect(validateSession()).resolves.toEqual({
      user: null,
      verified: true,
    });
    expect(getSession()).toBeNull();
  });

  it("keeps the cached user on a transient network failure", async () => {
    signIn();
    vi.mocked(cloud.fetchCloudUser).mockRejectedValueOnce(
      new Error("fetch failed"),
    );

    const result = await validateSession();
    expect(result.verified).toBe(false);
    expect(result.user?.name).toBe("Cached Name");
    expect(getSession()?.token).toBe("token");
  });

  it("answers from the cache when the cloud is slow, without blocking", async () => {
    signIn();
    vi.mocked(cloud.fetchCloudUser).mockImplementationOnce(
      () => new Promise(() => {}),
    );

    const pending = validateSession({ waitMs: 0 });
    await vi.advanceTimersByTimeAsync(0);
    const result = await pending;

    expect(result.verified).toBe(false);
    expect(result.user?.name).toBe("Cached Name");
    expect(getSession()?.token).toBe("token");
  });

  it("shares one in-flight cloud check across concurrent calls", async () => {
    signIn();
    let release: (() => void) | undefined;
    vi.mocked(cloud.fetchCloudUser).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              id: "user_1",
              email: "user@example.com",
              name: "Fresh Name",
              image: null,
            });
        }),
    );

    const first = validateSession();
    const second = validateSession();
    release?.();

    await expect(first).resolves.toEqual({
      user: expect.objectContaining({ name: "Fresh Name" }),
      verified: true,
    });
    await expect(second).resolves.toEqual({
      user: expect.objectContaining({ name: "Fresh Name" }),
      verified: true,
    });
    expect(cloud.fetchCloudUser).toHaveBeenCalledTimes(1);
  });

  it("validates again after a 401 even within the throttle window", async () => {
    signIn();
    await validateSession();
    clearSession();

    await expect(validateSession()).resolves.toEqual({
      user: null,
      verified: true,
    });
  });
});
