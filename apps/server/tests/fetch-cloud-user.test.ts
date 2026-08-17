import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FreestyleCloudAuthError,
  fetchCloudUser,
} from "../src/lib/freestyle-cloud.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("fetchCloudUser", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the profile for a live session", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse({
          session: { token: "t" },
          user: { id: "u1", email: "a@b.c", name: "A", image: null },
        }),
      ),
    );
    await expect(fetchCloudUser("token")).resolves.toMatchObject({
      id: "u1",
      email: "a@b.c",
    });
  });

  it("treats a null session body as an authentication failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse(null)),
    );
    await expect(fetchCloudUser("dead")).rejects.toBeInstanceOf(
      FreestyleCloudAuthError,
    );
  });

  it("treats a 401 as an authentication failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => jsonResponse({ message: "Unauthorized" }, 401)),
    );
    await expect(fetchCloudUser("dead")).rejects.toBeInstanceOf(
      FreestyleCloudAuthError,
    );
  });
});
