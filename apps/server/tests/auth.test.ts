import { afterEach, describe, expect, it } from "vitest";
import app from "../src/index.js";
import { setAuthToken } from "../src/lib/auth.js";

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

  it("rejects a websocket upgrade with the wrong ?token=", async () => {
    setAuthToken(TOKEN);
    const res = await app.request("/stream?token=wrong", {
      headers: { upgrade: "websocket" },
    });
    expect(res.status).toBe(401);
  });
});
