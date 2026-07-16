import { afterEach, describe, expect, it } from "vitest";
import createApp from "../src/index.js";
import { setAuthToken } from "../src/lib/auth.js";

// authMiddleware is wired directly into createApp(), so no token = open server.
const app = createApp();

const TOKEN = "test-secret";

afterEach(() => {
  // Reset so other suites (and cases) run unauthenticated.
  setAuthToken("");
});

describe("Bearer auth", () => {
  it("is disabled by default (no token configured)", async () => {
    const res = await app.request("/api/device-id");
    expect(res.status).toBe(200);
  });

  it("leaves /api/health open even when a token is set", async () => {
    setAuthToken(TOKEN);
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
  });

  it("rejects requests without a token", async () => {
    setAuthToken(TOKEN);
    const res = await app.request("/api/device-id");
    expect(res.status).toBe(401);
  });

  it("rejects requests with the wrong token", async () => {
    setAuthToken(TOKEN);
    const res = await app.request("/api/device-id", {
      headers: { Authorization: "Bearer wrong" },
    });
    expect(res.status).toBe(401);
  });

  it("accepts requests with the correct token", async () => {
    setAuthToken(TOKEN);
    const res = await app.request("/api/device-id", {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(res.status).toBe(200);
  });

  it("gates plugin UI asset requests (why the WebContentsView injects the token)", async () => {
    // A plugin page runs in a WebContentsView that can't set the Authorization
    // header itself, so the main process injects it per-request. This asserts
    // the route is actually auth-gated, so that injection is load-bearing.
    setAuthToken(TOKEN);
    const res = await app.request("/api/plugins/example/ui/index.html");
    expect(res.status).toBe(401);
  });

  it("rejects a websocket upgrade with the wrong ?token=", async () => {
    setAuthToken(TOKEN);
    const res = await app.request("/stream?token=wrong", {
      headers: { upgrade: "websocket" },
    });
    expect(res.status).toBe(401);
  });

  it("accepts a websocket upgrade with the correct ?token=", async () => {
    setAuthToken(TOKEN);
    const res = await app.request(`/stream?token=${TOKEN}`, {
      headers: { upgrade: "websocket" },
    });
    // Not 401 — the auth gate passed (the upgrade itself may still fail later).
    expect(res.status).not.toBe(401);
  });
});
