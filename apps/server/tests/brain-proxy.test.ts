import { afterEach, describe, expect, it, vi } from "vitest";
import createApp from "../src/index.js";
import { getDb, writeSetting } from "../src/lib/db.js";
import { freestyleCloudUrl } from "../src/lib/freestyle-cloud.js";
import { clearSession, setSession } from "../src/lib/sessions.js";

const app = createApp();

afterEach(() => {
  clearSession();
  vi.unstubAllGlobals();
  getDb().exec(
    "DELETE FROM sync_entities; DELETE FROM sync_operations; DELETE FROM sync_resource_state;",
  );
});

function setCachedScope(): void {
  const host = freestyleCloudUrl();
  setSession({
    token: "cloud-session",
    user: { id: "brain-user", email: "brain@example.com" },
    host,
  });
  writeSetting(`sync_scope:${host}:brain-user`, "cloud:brain-user:brain-org");
}

async function flushAsyncWork(): Promise<void> {
  for (let index = 0; index < 10; index += 1) await Promise.resolve();
}

describe("Brain cached reads", () => {
  it.each([
    ["/api/brain/list", { method: "GET" }],
    ["/api/brain/graph", { method: "GET" }],
    [
      "/api/brain/read",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: "notes/example.md" }),
      },
    ],
  ] as const)("preserves Cloud auth failures for %s", async (path, init) => {
    const response = await app.request(path, init);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      reason: "cloud_auth_required",
    });
  });

  it("sends a later write only after the in-flight write settles", async () => {
    setCachedScope();
    let resolveFirst!: (response: Response) => void;
    const firstResponse = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => firstResponse)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true, version: 3 }), {
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await app.request("/api/brain/write", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        path: "notes/ordered.md",
        text: "first",
        ifMatch: 1,
      }),
    });
    await app.request("/api/brain/write", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: "notes/ordered.md", text: "second" }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFirst(
      new Response(JSON.stringify({ ok: true, version: 2 }), {
        headers: { "content-type": "application/json" },
      }),
    );
    await flushAsyncWork();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string),
    ).toMatchObject({
      path: "notes/ordered.md",
      text: "second",
      ifMatch: 2,
      clientOperationId: expect.any(String),
    });
  });

  it("sends a deletion only after the in-flight write settles", async () => {
    setCachedScope();
    let resolveFirst!: (response: Response) => void;
    const firstResponse = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => firstResponse)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    await app.request("/api/brain/write", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: "notes/remove.md", text: "draft" }),
    });
    await app.request("/api/brain/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: "notes/remove.md" }),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolveFirst(
      new Response(JSON.stringify({ ok: true, version: 4 }), {
        headers: { "content-type": "application/json" },
      }),
    );
    await flushAsyncWork();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(
      JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string),
    ).toMatchObject({
      path: "notes/remove.md",
      clientOperationId: expect.any(String),
    });
  });
});
