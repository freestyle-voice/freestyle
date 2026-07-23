import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FreestyleCloudAuthError,
  SESSION_LIFETIME_MS,
} from "../src/lib/freestyle-cloud.js";
import { renewSession } from "../src/lib/session-keepalive.js";
import { clearSession, getSession, setSession } from "../src/lib/sessions.js";

vi.mock("../src/lib/freestyle-cloud.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/lib/freestyle-cloud.js")>();
  return {
    ...actual,
    fetchCloudUser: vi.fn(async () => ({
      id: "user_1",
      email: "user@example.com",
      name: "User",
      image: null,
    })),
  };
});

const cloud = await import("../src/lib/freestyle-cloud.js");

const HOST = "https://service.freestylevoice.com";
const USER = { id: "user_1", email: "user@example.com" };

function signInWithRemaining(remainingMs: number): void {
  setSession({
    token: "token",
    expiresAt: Date.now() + remainingMs,
    issuedAt: Date.now(),
    user: USER,
    host: HOST,
  });
}

afterEach(() => {
  clearSession();
  vi.clearAllMocks();
});

describe("renewSession", () => {
  it("no-ops when there is no session", async () => {
    await expect(renewSession()).resolves.toBe("no-session");
    expect(cloud.fetchCloudUser).not.toHaveBeenCalled();
  });

  it("does not renew when plenty of time remains", async () => {
    signInWithRemaining(5 * 24 * 60 * 60 * 1000); // 5 days
    await expect(renewSession()).resolves.toBe("not-needed");
    expect(cloud.fetchCloudUser).not.toHaveBeenCalled();
  });

  it("renews when within the 2-day threshold", async () => {
    signInWithRemaining(24 * 60 * 60 * 1000); // 1 day
    const before = getSession()?.expiresAt ?? 0;

    await expect(renewSession()).resolves.toBe("renewed");

    expect(cloud.fetchCloudUser).toHaveBeenCalledTimes(1);
    const after = getSession()?.expiresAt ?? 0;
    expect(after).toBeGreaterThan(before);
    // New expiry should be ~one full lifetime out from now.
    expect(after).toBeGreaterThan(Date.now() + SESSION_LIFETIME_MS - 5_000);
  });

  it("renews regardless of remaining time when forced", async () => {
    signInWithRemaining(5 * 24 * 60 * 60 * 1000); // 5 days
    await expect(renewSession(true)).resolves.toBe("renewed");
    expect(cloud.fetchCloudUser).toHaveBeenCalledTimes(1);
  });

  it("keeps the same token after renewal (no re-auth)", async () => {
    signInWithRemaining(60 * 60 * 1000); // 1 hour
    await renewSession();
    expect(getSession()?.token).toBe("token");
  });

  it("invalidates the session when the cloud rejects the token (401)", async () => {
    signInWithRemaining(60 * 60 * 1000); // 1 hour
    vi.mocked(cloud.fetchCloudUser).mockRejectedValueOnce(
      new FreestyleCloudAuthError(),
    );

    await expect(renewSession()).resolves.toBe("expired");
    expect(getSession()).toBeNull();
  });

  it("keeps the session on a transient network failure", async () => {
    signInWithRemaining(60 * 60 * 1000); // 1 hour
    vi.mocked(cloud.fetchCloudUser).mockRejectedValueOnce(
      new Error("fetch failed"),
    );

    await expect(renewSession()).resolves.toBe("not-needed");
    // Session survives so the next tick can retry.
    expect(getSession()?.token).toBe("token");
  });

  it("treats a session with no local expiry as not needing renewal", async () => {
    setSession({ token: "token", user: USER, host: HOST });
    await expect(renewSession()).resolves.toBe("not-needed");
    expect(cloud.fetchCloudUser).not.toHaveBeenCalled();
  });
});
