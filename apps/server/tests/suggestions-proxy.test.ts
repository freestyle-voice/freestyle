import { afterEach, describe, expect, it, vi } from "vitest";
import createApp from "../src/index.js";
import { freestyleCloudUrl } from "../src/lib/freestyle-cloud.js";
import { clearSession, setSession } from "../src/lib/sessions.js";

const app = createApp();

afterEach(() => {
  clearSession();
  vi.unstubAllGlobals();
});

describe("suggestions proxy", () => {
  it("requires the server-owned Freestyle Cloud session", async () => {
    const response = await app.request("/api/suggestions/capabilities");

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "cloud_auth_required",
    });
  });

  it("forwards the capabilities request to Cloud", async () => {
    setSession({
      token: "cloud-session",
      user: { id: "user-1", email: "user@example.com" },
      host: freestyleCloudUrl(),
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ groups: [] }), {
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.request("/api/suggestions/capabilities");

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      `${freestyleCloudUrl()}/v2/suggestions/capabilities`,
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer cloud-session",
        }),
      }),
    );
  });
});
