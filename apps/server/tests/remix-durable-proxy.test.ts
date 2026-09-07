import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import createApp from "../src/index.js";
import { closeDb } from "../src/lib/db.js";
import { freestyleCloudUrl } from "../src/lib/freestyle-cloud.js";
import {
  deferRemixCancel,
  flushRemixCancels,
  pendingRemixCancels,
} from "../src/lib/remix-cancel-outbox.js";
import { remixQueueSnapshot } from "../src/lib/remix-durable-queue.js";
import { clearSession, setSession } from "../src/lib/sessions.js";

const app = createApp();
const turnId = "00000000-0000-4000-8000-000000000001";
const signIn = (id = "user-a") =>
  setSession({
    token: "cloud-token",
    user: { id, email: "test@example.test" },
    host: freestyleCloudUrl(),
  });
const ownerHeaders = (id = "user-a", host = freestyleCloudUrl()) => ({
  "X-Remix-User": id,
  "X-Remix-Host": encodeURIComponent(host),
});
beforeEach(() => signIn());
afterEach(async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({})),
  );
  await flushRemixCancels();
  clearSession();
  vi.unstubAllGlobals();
});

describe("additive durable Remix proxy", () => {
  it("grants a replayed Cloud claim to only one local execution observer", async () => {
    const actionId = crypto.randomUUID();
    const observers = [crypto.randomUUID(), crypto.randomUUID()];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          action: { id: actionId, toolName: "paste", input: {} },
        }),
      ),
    );
    const claim = (observerId: string) =>
      app.request(`/api/remix/turns/${turnId}/commands`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Remix-User": "user-a",
          "X-Remix-Host": encodeURIComponent(freestyleCloudUrl()),
        },
        body: JSON.stringify({
          type: "desktop_claim",
          actionId,
          clientId: "same-cloud-claimant",
          observerId,
        }),
      });
    const responses = await Promise.all(observers.map(claim));
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 409,
    ]);
    const winner = responses.findIndex((response) => response.ok);
    closeDb();
    expect((await claim(observers[1 - winner])).status).toBe(409);
    // Only the same still-live observer may recover a lost local response.
    expect((await claim(observers[winner])).status).toBe(200);
  });
  it("proxies an owned predecessor receipt after the checkpoint advances", async () => {
    const actionId = crypto.randomUUID();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          action: {
            id: actionId,
            turnId,
            status: "expired",
            toolName: "paste",
            invocationId: "invocation",
            retryOfActionId: null,
          },
        }),
      ),
    );
    const response = await app.request(
      `/api/remix/turns/${turnId}/actions/${actionId}`,
      { headers: ownerHeaders() },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      action: { id: actionId, status: "expired" },
    });
    expect(
      (
        await app.request(`/api/remix/turns/${turnId}/actions/not-a-uuid`, {
          headers: ownerHeaders(),
        })
      ).status,
    ).toBe(400);
  });
  it("rejects an old owner's mutation after identity lookup but before the POST", async () => {
    const identity = (await (
      await app.request("/api/remix/identity")
    ).json()) as { userId: string; host: string };
    signIn("user-b");
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const headers = {
      "Content-Type": "application/json",
      "X-Remix-User": identity.userId,
      "X-Remix-Host": encodeURIComponent(identity.host),
    };
    for (const [path, body] of [
      [
        "/api/remix/turns",
        {
          threadId: "private-a",
          clientRequestId: "private-request-a",
          messages: [
            { role: "user", parts: [{ type: "text", text: "Private A" }] },
          ],
          context: {
            selection: null,
            appName: null,
            windowTitle: null,
            capturedAt: 1,
          },
        },
      ],
      [
        "/api/remix/private-a/queue",
        { requestId: crypto.randomUUID(), text: "Private A queue" },
      ],
    ] as const) {
      expect(
        (
          await app.request(path, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
          })
        ).status,
      ).toBe(401);
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(remixQueueSnapshot("private-a").items).toEqual([]);
    expect(
      (
        await app.request("/api/remix/private-a/queue", {
          method: "POST",
          headers: {
            ...headers,
            "X-Remix-User": "user-b",
            "X-Remix-Host": encodeURIComponent("https://different-host.test"),
          },
          body: JSON.stringify({
            requestId: crypto.randomUUID(),
            text: "Private host A",
          }),
        })
      ).status,
    ).toBe(401);
  });
  it("rejects an old owner's durable reads after the account changes", async () => {
    const fetch = vi.fn(async () =>
      Response.json({ turn: { id: turnId, status: "running" } }),
    );
    vi.stubGlobal("fetch", fetch);
    const oldOwner = ownerHeaders();
    expect(
      (await app.request(`/api/remix/turns/${turnId}`, { headers: oldOwner }))
        .status,
    ).toBe(200);
    signIn("user-b");
    expect(
      (await app.request(`/api/remix/turns/${turnId}`, { headers: oldOwner }))
        .status,
    ).toBe(401);
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("discards an admission response if the signed-in account changed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        signIn("user-b");
        return Response.json({ turn: { id: turnId } }, { status: 202 });
      }),
    );
    const response = await app.request("/api/remix/turns", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Remix-User": "user-a",
        "X-Remix-Host": encodeURIComponent(freestyleCloudUrl()),
      },
      body: JSON.stringify({
        threadId: "switched-thread",
        clientRequestId: "request-a",
        messages: [{ role: "user", parts: [{ type: "text", text: "Hello" }] }],
        context: {
          selection: null,
          appName: null,
          windowTitle: null,
          capturedAt: 1,
        },
      }),
    });
    expect(response.status).toBe(401);
    expect(remixQueueSnapshot("switched-thread").activeTurnId).toBeNull();
  });
  it("passes immutable admission through the server-owned capability boundary", async () => {
    const fetch = vi.fn(async () =>
      Response.json(
        { turn: { id: turnId }, receipt: { duplicate: false } },
        { status: 202 },
      ),
    );
    vi.stubGlobal("fetch", fetch);
    const response = await app.request("/api/remix/turns", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Remix-User": "user-a",
        "X-Remix-Host": encodeURIComponent(freestyleCloudUrl()),
      },
      body: JSON.stringify({
        threadId: "thread-a",
        clientRequestId: "request-a",
        messages: [{ role: "user", parts: [{ type: "text", text: "Hello" }] }],
        context: {
          selection: null,
          appName: null,
          windowTitle: null,
          capturedAt: 1,
        },
        client: { platform: "android", localTools: [] },
      }),
    });
    expect(response.status).toBe(202);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${freestyleCloudUrl()}/v2/remix/turns`);
    const payload = JSON.parse(String(init.body));
    expect(payload.clientRequestId).toBe("request-a");
    expect(payload.client.platform).toBe(process.platform);
    expect(payload.client.localTools).toContain("Bash");
    expect(init.headers).toMatchObject({ Authorization: "Bearer cloud-token" });
  });
  it("preserves terminal receipt responses and validates IDs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          turn: { id: turnId, status: "canceled" },
          receipt: { terminal: true, retryable: false },
        }),
      ),
    );
    const response = await app.request(`/api/remix/turns/${turnId}`, {
      headers: ownerHeaders(),
    });
    expect(await response.json()).toMatchObject({
      receipt: { terminal: true, retryable: false },
    });
    expect(
      (
        await app.request("/api/remix/turns/not-a-uuid", {
          headers: ownerHeaders(),
        })
      ).status,
    ).toBe(400);
  });
  it("persists offline cancellation and flushes it after connectivity returns", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("offline");
      }),
    );
    const response = await app.request(`/api/remix/turns/${turnId}/commands`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Remix-User": "user-a",
        "X-Remix-Host": encodeURIComponent(freestyleCloudUrl()),
      },
      body: JSON.stringify({ type: "cancel" }),
    });
    expect(response.status).toBe(202);
    await flushRemixCancels();
    expect(pendingRemixCancels()).toEqual([turnId]);
    const fetch = vi.fn(async () =>
      Response.json({ receipt: { canceled: true } }),
    );
    vi.stubGlobal("fetch", fetch);
    await flushRemixCancels();
    expect(pendingRemixCancels()).toEqual([]);
    expect(fetch).toHaveBeenCalledWith(
      `${freestyleCloudUrl()}/v2/remix/turns/${turnId}/commands`,
      expect.objectContaining({ body: JSON.stringify({ type: "cancel" }) }),
    );
  });
  it("does not send another account's cancellation outbox", async () => {
    deferRemixCancel(turnId);
    signIn("user-b");
    const fetch = vi.fn(async () => Response.json({}));
    vi.stubGlobal("fetch", fetch);
    await flushRemixCancels();
    expect(fetch).not.toHaveBeenCalled();
    signIn();
    await flushRemixCancels();
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("recovers and cancels an unknown receipt after the submitting renderer closes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    const request = {
      threadId: "thread-a",
      clientRequestId: "lost-request-a",
      messages: [{ role: "user", parts: [{ type: "text", text: "Hello" }] }],
      context: {
        selection: null,
        appName: null,
        windowTitle: null,
        capturedAt: 1,
      },
    };
    const response = await app.request("/api/remix/cancel", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Remix-User": "user-a",
        "X-Remix-Host": encodeURIComponent(freestyleCloudUrl()),
      },
      body: JSON.stringify({ request }),
    });
    expect(response.status).toBe(202);
    await flushRemixCancels();
    const fetch = vi.fn(async (url: string) =>
      url.endsWith("/turns")
        ? Response.json({ turn: { id: turnId } })
        : Response.json({ receipt: { canceled: true } }),
    );
    vi.stubGlobal("fetch", fetch);
    await flushRemixCancels();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][0]).toBe(
      `${freestyleCloudUrl()}/v2/remix/turns`,
    );
    expect(fetch.mock.calls[1][0]).toBe(
      `${freestyleCloudUrl()}/v2/remix/turns/${turnId}/commands`,
    );
  });
});
