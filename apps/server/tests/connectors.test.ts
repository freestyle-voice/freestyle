import { afterEach, describe, expect, it } from "vitest";
import createApp from "../src/index.js";
import { clearSession } from "../src/lib/sessions.js";

const app = createApp();

afterEach(() => clearSession());

describe("connector proxy", () => {
  it("requires the server-owned Freestyle Cloud session", async () => {
    const response = await app.request("/api/connectors");

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "cloud_auth_required",
    });
  });
});
