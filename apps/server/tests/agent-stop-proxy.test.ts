import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/freestyle-cloud.js", () => ({
  DEFAULT_CLOUD_URL: "https://service.freestylevoice.com",
  freestyleCloudUrl: () => "https://cloud.test",
}));

import { clearSession, setSession } from "../src/lib/sessions.js";
import agentRoute from "../src/routes/agent.js";

describe("agent stop proxy", () => {
  afterEach(() => {
    clearSession();
    vi.unstubAllGlobals();
  });

  it("forwards an explicit durable cancel with the server-owned session", async () => {
    setSession({
      token: "cloud-session",
      user: { id: "user-1", email: "user@example.com" },
      host: "https://cloud.test",
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await agentRoute.request(
      "/turn/123e4567-e89b-12d3-a456-426614174000/commands",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: "cancel" }),
      },
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://cloud.test/v2/turns/123e4567-e89b-12d3-a456-426614174000/commands",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer cloud-session",
        }),
        body: JSON.stringify({ type: "cancel" }),
      }),
    );
  });
});
