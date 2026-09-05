import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

describe("typed API client startup routing", () => {
  beforeEach(() => {
    vi.resetModules();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("window", {
      api: {
        getServerUrl: vi.fn(async () => "https://desktop.example.test"),
        getServerToken: vi.fn(async () => "configured-server-token"),
        getServerPort: vi.fn(async () => 4649),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("resolves the configured target and bearer token at request dispatch", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({}), {
        headers: { "content-type": "application/json" },
      }),
    );
    const { getClient } = await import("./api");

    await getClient().api.settings.$get();

    const request = fetchMock.mock.calls[0]?.[0] as Request;
    expect(request.url).toBe("https://desktop.example.test/api/settings");
    expect(request.headers.get("authorization")).toBe(
      "Bearer configured-server-token",
    );
  });

  it("reports a typed protected 401 to the shared observer", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 401 }));
    const { getClient, subscribeToUnauthorized } = await import("./api");
    const unauthorized = vi.fn();
    const unsubscribe = subscribeToUnauthorized(unauthorized);

    await getClient().api.settings.$get();

    expect(unauthorized).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
