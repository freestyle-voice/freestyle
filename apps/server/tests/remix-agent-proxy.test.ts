import { afterEach, describe, expect, it, vi } from "vitest";
import createApp from "../src/index.js";
import { freestyleCloudUrl } from "../src/lib/freestyle-cloud.js";
import { clearSession, setSession } from "../src/lib/sessions.js";

const app = createApp();

afterEach(() => {
  clearSession();
  vi.unstubAllGlobals();
});

describe("Remix agent proxy", () => {
  it("requires the server-owned Freestyle Cloud session", async () => {
    const response = await app.request("/api/remix", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [{ id: "turn-1", role: "user", parts: [] }],
        context: {
          selection: null,
          appName: null,
          windowTitle: null,
          capturedAt: 1,
        },
      }),
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "cloud_auth_required",
    });
  });

  it("forwards the pill conversation and captured context to the Remix agent", async () => {
    setSession({
      token: "cloud-session",
      user: { id: "user-1", email: "user@example.com" },
      host: freestyleCloudUrl(),
    });
    const payload = {
      messages: [
        {
          id: "turn-1",
          role: "user",
          parts: [{ type: "text", text: "Make this shorter" }],
        },
      ],
      context: {
        selection: "A long sentence.",
        appName: "Notes",
        windowTitle: "Draft",
        clipboard: null,
        clipboardLength: 0,
        capturedAt: 1,
      },
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response("data: {}\n\n", {
        headers: { "content-type": "text/event-stream" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await app.request("/api/remix", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/event-stream");
    expect(fetchMock).toHaveBeenCalledWith(
      `${freestyleCloudUrl()}/v2/remix`,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer cloud-session",
          "Content-Type": "application/json",
        }),
        body: JSON.stringify(payload),
      }),
    );
  });
});
