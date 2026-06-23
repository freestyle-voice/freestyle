import { afterEach, describe, expect, it, vi } from "vitest";
import app from "../src/index.js";
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
    freestyleCloudUrl: vi.fn(() => "https://service.freestylevoice.com"),
    pollDeviceToken: vi.fn(),
    requestDeviceCode: vi.fn(async () => ({
      device_code: "device-code",
      user_code: "ABCD-1234",
      verification_uri: "https://service.freestylevoice.com/device",
      verification_uri_complete:
        "https://service.freestylevoice.com/device?user_code=ABCD-1234",
      expires_in: 600,
      interval: 1,
    })),
    signOutCloud: vi.fn(async () => {}),
  };
});

afterEach(() => {
  clearSession();
  vi.clearAllMocks();
});

describe("Freestyle Cloud auth sessions", () => {
  it("stores and reads the active session", () => {
    setSession({
      token: "token",
      user: { id: "user_1", email: "user@example.com" },
      host: "https://service.freestylevoice.com",
    });

    expect(getSession()?.token).toBe("token");
    expect(getSession()?.user.email).toBe("user@example.com");
  });

  it("clears expired sessions", () => {
    setSession({
      token: "token",
      expiresAt: Date.now() - 1,
      user: { id: "user_1", email: "user@example.com" },
      host: "https://service.freestylevoice.com",
    });

    expect(getSession()).toBeNull();
  });
});

describe("/api/auth", () => {
  it("rejects untrusted browser origins", async () => {
    const res = await app.request("/api/auth/status", {
      headers: { origin: "https://example.com" },
    });

    expect(res.status).toBe(403);
  });

  it("maps authorization_pending without treating it as a server error", async () => {
    const cloud = await import("../src/lib/freestyle-cloud.js");
    vi.mocked(cloud.pollDeviceToken).mockRejectedValueOnce(
      new cloud.DeviceFlowError("authorization_pending"),
    );

    const res = await app.request("/api/auth/device/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device_code: "device-code" }),
    });

    expect(res.status).toBe(202);
    await expect(res.json()).resolves.toEqual({
      error: "authorization_pending",
    });
  });

  it("maps denied device flow to a client error", async () => {
    const cloud = await import("../src/lib/freestyle-cloud.js");
    vi.mocked(cloud.pollDeviceToken).mockRejectedValueOnce(
      new cloud.DeviceFlowError("access_denied"),
    );

    const res = await app.request("/api/auth/device/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ device_code: "device-code" }),
    });

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "access_denied" });
  });
});
