import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/lib/sessions.js", () => ({
  getSessionToken: () => "token",
  invalidateSession: vi.fn(),
}));

vi.mock("../src/lib/freestyle-cloud.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/freestyle-cloud.js")>()),
  freestyleCloudUrl: () => "https://cloud.test",
}));

import agentThreadsRoute from "../src/routes/agent-threads.js";
import routes from "../src/routes/index.js";

describe("agent thread list proxy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forwards origin, limit and cursor to the cloud", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ threads: [], nextCursor: null }), {
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await agentThreadsRoute.request(
      "/list?limit=24&cursor=1700000000000&origin=user&junk=1",
    );
    expect(res.status).toBe(200);
    const url = new URL(fetchMock.mock.calls[0][0] as string);
    expect(url.pathname).toBe("/v2/threads");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      origin: "user",
      limit: "24",
      cursor: "1700000000000",
    });
  });

  it("reserves list and latest before the generic thread snapshot route", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ threads: [], nextCursor: null }), {
          headers: { "content-type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await routes.request("/api/agent/thread/list?origin=user");

    expect(res.status).toBe(200);
    expect(new URL(fetchMock.mock.calls[0][0] as string).pathname).toBe(
      "/v2/threads",
    );

    const latest = await routes.request("/api/agent/thread/latest");

    expect(latest.status).toBe(200);
    expect(new URL(fetchMock.mock.calls[1][0] as string).pathname).toBe(
      "/v2/threads/latest",
    );
  });
});
