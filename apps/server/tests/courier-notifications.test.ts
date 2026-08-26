import { afterEach, describe, expect, it, vi } from "vitest";
import createApp from "../src/index.js";
import { clearSession, setSession } from "../src/lib/sessions.js";

afterEach(() => {
  clearSession();
  vi.unstubAllGlobals();
});

describe("Courier notification token proxy", () => {
  it("keeps the Cloud bearer token server-side and returns a self-scoped session", async () => {
    setSession({
      token: "cloud-session-secret",
      user: { id: "user-1", email: "user@example.com" },
      host: "https://service.freestylevoice.com",
    });
    const cloud = vi.fn(
      async () =>
        new Response(JSON.stringify({ token: "courier-client-jwt" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", cloud);

    const response = await createApp().request("/api/notifications/token", {
      method: "POST",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      token: "courier-client-jwt",
      userId: "user-1",
    });
    expect(cloud).toHaveBeenCalledWith(
      "https://service.freestylevoice.com/v2/notifications/token",
      expect.objectContaining({
        method: "POST",
        headers: { authorization: "Bearer cloud-session-secret" },
      }),
    );
  });

  it("does not contact Cloud when the desktop is signed out", async () => {
    const cloud = vi.fn();
    vi.stubGlobal("fetch", cloud);

    const response = await createApp().request("/api/notifications/token", {
      method: "POST",
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      reason: "cloud_auth_required",
    });
    expect(cloud).not.toHaveBeenCalled();
  });

  it("maps an unavailable Courier token service to a retryable response", async () => {
    setSession({
      token: "cloud-session-secret",
      user: { id: "user-1", email: "user@example.com" },
      host: "https://service.freestylevoice.com",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("unavailable", { status: 503 })),
    );

    const response = await createApp().request("/api/notifications/token", {
      method: "POST",
    });

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      reason: "cloud_unreachable",
    });
  });
});
