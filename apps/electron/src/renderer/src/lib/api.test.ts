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

  it("preserves the JSON device-token poll body while routing to the configured target", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({}), {
        headers: { "content-type": "application/json" },
      }),
    );
    const { getClient } = await import("./api");

    await getClient().api.auth.device.token.$post({
      json: { device_code: "device-code" },
    });

    const request = fetchMock.mock.calls[0]?.[0] as Request;
    expect(request.url).toBe(
      "https://desktop.example.test/api/auth/device/token",
    );
    expect(request.method).toBe("POST");
    expect(request.headers.get("authorization")).toBe(
      "Bearer configured-server-token",
    );
    await expect(request.json()).resolves.toEqual({
      device_code: "device-code",
    });
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

  it("keeps caller auth, request options, and cancellation when rerouting JSON", async () => {
    fetchMock.mockResolvedValue(Response.json({ ok: true }));
    const { getClient } = await import("./api");
    const controller = new AbortController();

    await getClient().api.auth.device.token.$post(
      { json: { device_code: "device-code" } },
      {
        init: {
          headers: {
            authorization: "Bearer caller-token",
            "content-type": "application/json",
            "x-request-id": "caller-request",
          },
          signal: controller.signal,
          credentials: "include",
          redirect: "error",
          cache: "no-store",
          keepalive: true,
        },
      },
    );

    const request = fetchMock.mock.calls[0]?.[0] as Request;
    expect(request.headers.get("authorization")).toBe("Bearer caller-token");
    expect(request.headers.get("x-request-id")).toBe("caller-request");
    expect(request.credentials).toBe("include");
    expect(request.redirect).toBe("error");
    expect(request.cache).toBe("no-store");
    expect(request.keepalive).toBe(true);
    expect(request.signal.aborted).toBe(false);
    controller.abort();
    expect(request.signal.aborted).toBe(true);
    await expect(request.json()).resolves.toEqual({
      device_code: "device-code",
    });
  });

  it("preserves bodyless device-code POST requests", async () => {
    fetchMock.mockResolvedValue(Response.json({ ok: true }));
    const { getClient } = await import("./api");

    await getClient().api.auth.device.code.$post();

    const request = fetchMock.mock.calls[0]?.[0] as Request;
    expect(request.url).toBe(
      "https://desktop.example.test/api/auth/device/code",
    );
    expect(request.method).toBe("POST");
    expect(request.body).toBeNull();
  });

  it("does not sign out for a stale Remix ownership response", async () => {
    fetchMock.mockResolvedValue(
      Response.json({ error: "remix_account_changed" }, { status: 401 }),
    );
    const { getClient, subscribeToUnauthorized } = await import("./api");
    const unauthorized = vi.fn();
    const unsubscribe = subscribeToUnauthorized(unauthorized);

    await getClient().api.settings.$get();

    expect(unauthorized).not.toHaveBeenCalled();
    unsubscribe();
  });
});
