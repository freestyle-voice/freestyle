import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "../src/lib/db.js";
import { freestyleCloudUrl } from "../src/lib/freestyle-cloud.js";
import { clearSession, setSession } from "../src/lib/sessions.js";
import remixRoute from "../src/routes/remix.js";

beforeEach(() => {
  clearSession();
  getDb().prepare("DELETE FROM remix_messages").run();
  getDb().prepare("DELETE FROM remix_runs").run();
  getDb().prepare("DELETE FROM remix_threads").run();
  getDb().prepare("DELETE FROM model_configs WHERE type = 'remix'").run();
});

afterEach(() => vi.unstubAllGlobals());

describe("Remix local session boundary", () => {
  it.each([
    "local-llm",
    "openai",
  ])("streams through the configured %s provider without a Freestyle account", async (provider) => {
    getDb()
      .prepare(
        "INSERT INTO model_configs (provider, model_id, model_name, type, is_default) VALUES (?, ?, 'Test model', 'remix', 1)",
      )
      .run(provider, `${provider}/test-chat`);
    getDb()
      .prepare(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('local_llm_url', 'http://127.0.0.1:11434')",
      )
      .run();
    getDb()
      .prepare(
        "INSERT OR REPLACE INTO api_keys (provider, key, status) VALUES ('openai', 'test-provider-key', 'valid')",
      )
      .run();
    const requestFetch = vi.fn(
      async () =>
        new Response(
          `${[
            {
              id: "reply-1",
              object: "chat.completion.chunk",
              created: 1,
              model: "test-chat",
              choices: [
                {
                  index: 0,
                  delta: {
                    role: "assistant",
                    content: "Hello from the provider",
                  },
                  finish_reason: null,
                },
              ],
            },
            {
              id: "reply-1",
              object: "chat.completion.chunk",
              created: 1,
              model: "test-chat",
              choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
            },
          ]
            .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
            .join("")}data: [DONE]\n\n`,
          { headers: { "Content-Type": "text/event-stream" } },
        ),
    );
    vi.stubGlobal("fetch", requestFetch);
    const { thread } = (await (
      await remixRoute.request("/sessions", { method: "POST" })
    ).json()) as { thread: { id: string } };
    const response = await remixRoute.request(`/sessions/${thread.id}/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: [
          {
            id: "question",
            role: "user",
            parts: [{ type: "text", text: "Hello" }],
          },
        ],
        context: {
          selection: null,
          appName: null,
          windowTitle: null,
          capturedAt: 1,
        },
      }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1");
    expect(await response.text()).toContain("Hello from the provider");
    expect(requestFetch).toHaveBeenCalledTimes(1);
    const [url, request] = requestFetch.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(String(url)).toBe(
      provider === "local-llm"
        ? "http://127.0.0.1:11434/v1/chat/completions"
        : "https://api.openai.com/v1/chat/completions",
    );
    expect(JSON.parse(String(request.body)).model).toBe("test-chat");
    getDb().prepare("DELETE FROM settings WHERE key = 'local_llm_url'").run();
    getDb().prepare("DELETE FROM api_keys WHERE provider = 'openai'").run();
  });

  it("requires an account before recording managed-session metadata", async () => {
    const response = await remixRoute.request("/sessions", { method: "POST" });
    expect(response.status).toBe(401);
  });

  it("exposes model routing to guests without account data", async () => {
    const managed = await remixRoute.request("/sessions/runtime");
    await expect(managed.json()).resolves.toEqual({ kind: "managed" });
    getDb()
      .prepare(
        "INSERT INTO model_configs (provider, model_id, model_name, type, is_default) VALUES ('openai', 'openai/gpt-test', 'Test', 'remix', 1)",
      )
      .run();
    const personal = await remixRoute.request("/sessions/runtime");
    await expect(personal.json()).resolves.toEqual({
      kind: "local",
      model: {
        provider: "openai",
        model_id: "openai/gpt-test",
        model_name: "Test",
      },
    });
    expect(
      (await remixRoute.request("/sessions", { method: "POST" })).status,
    ).toBe(201);
  });

  it("paginates guest local history and restores the latest transcript", async () => {
    getDb()
      .prepare(
        "INSERT INTO model_configs (provider, model_id, model_name, type, is_default) VALUES ('local-llm', 'local-llm/qwen', 'Qwen', 'remix', 1)",
      )
      .run();
    for (let index = 0; index < 3; index++) {
      const created = await remixRoute.request("/sessions", { method: "POST" });
      const { thread } = (await created.json()) as { thread: { id: string } };
      await remixRoute.request(`/sessions/${thread.id}/messages`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              id: `message-${index}`,
              role: "user",
              parts: [{ type: "text", text: "Hello" }],
            },
          ],
        }),
      });
    }
    const first = (await (
      await remixRoute.request("/sessions/local?limit=2")
    ).json()) as { threads: { id: string }[]; nextCursor: number };
    const second = (await (
      await remixRoute.request(
        `/sessions/local?limit=2&cursor=${first.nextCursor}`,
      )
    ).json()) as { threads: { id: string }[]; nextCursor: null };
    expect(first.nextCursor).toBe(2);
    expect(second.nextCursor).toBeNull();
    expect(
      new Set([...first.threads, ...second.threads].map((t) => t.id)).size,
    ).toBe(3);
    const latest = await remixRoute.request("/sessions/local/latest");
    await expect(latest.json()).resolves.toMatchObject({
      thread: {
        id: first.threads[0].id,
        type: "local",
        model: { provider: "local-llm" },
        messages: [{ role: "user" }],
      },
    });
    expect((await remixRoute.request("/sessions/local?cursor=-1")).status).toBe(
      400,
    );
  });

  it("creates an explicit local session for a non-Cloud Remix model", async () => {
    getDb()
      .prepare(
        `INSERT INTO model_configs
          (provider, model_id, model_name, type, is_default)
         VALUES ('local-llm', 'local-llm/qwen', 'Qwen', 'remix', 1)`,
      )
      .run();

    const response = await remixRoute.request("/sessions", { method: "POST" });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      thread: { type: "local", messages: [] },
    });
  });

  it("creates a remote session for managed Cloud and never permits its messages in SQLite", async () => {
    setSession({
      token: "session-token",
      user: { id: "user-1", email: "user@example.com" },
      host: freestyleCloudUrl(),
    });
    const response = await remixRoute.request("/sessions", { method: "POST" });
    const { thread } = (await response.json()) as {
      thread: { id: string; type: string };
    };

    expect(thread.type).toBe("remote");
    const save = await remixRoute.request(`/sessions/${thread.id}/messages`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ id: "message-1", role: "user" }] }),
    });
    expect(save.status).toBe(404);
    expect(
      getDb().prepare("SELECT COUNT(*) AS n FROM remix_messages").get(),
    ).toEqual({ n: 0 });
    const stream = await remixRoute.request(`/sessions/${thread.id}/stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [{ id: "message-1", role: "user", parts: [] }],
        context: {
          selection: null,
          appName: null,
          windowTitle: null,
          capturedAt: 1,
        },
      }),
    });
    expect(stream.status).toBe(404);
  });

  it("freezes ownership at creation when the selected model later changes", async () => {
    setSession({
      token: "session-token",
      user: { id: "user-1", email: "user@example.com" },
      host: freestyleCloudUrl(),
    });
    const remote = (await (
      await remixRoute.request("/sessions", { method: "POST" })
    ).json()) as {
      thread: { id: string; type: string };
    };
    getDb()
      .prepare(
        `INSERT INTO model_configs
          (provider, model_id, model_name, type, is_default)
         VALUES ('local-llm', 'local-llm/qwen', 'Qwen', 'remix', 1)`,
      )
      .run();
    const local = (await (
      await remixRoute.request("/sessions", { method: "POST" })
    ).json()) as {
      thread: { id: string; type: string };
    };

    expect(remote.thread.type).toBe("remote");
    expect(local.thread.type).toBe("local");
    expect(
      getDb()
        .prepare("SELECT type FROM remix_threads WHERE id = ?")
        .get(remote.thread.id),
    ).toEqual({ type: "remote" });
  });

  it("persists local titles and removes only local sessions", async () => {
    getDb()
      .prepare(
        `INSERT INTO model_configs
          (provider, model_id, model_name, type, is_default)
         VALUES ('local-llm', 'local-llm/qwen', 'Qwen', 'remix', 1)`,
      )
      .run();
    const created = (await (
      await remixRoute.request("/sessions", { method: "POST" })
    ).json()) as { thread: { id: string } };

    const renamed = await remixRoute.request(`/sessions/${created.thread.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Local draft" }),
    });
    expect(renamed.status).toBe(200);
    await expect(
      remixRoute.request(`/sessions/${created.thread.id}`),
    ).resolves.toHaveProperty("status", 200);
    expect(
      getDb()
        .prepare("SELECT title FROM remix_threads WHERE id = ?")
        .get(created.thread.id),
    ).toEqual({ title: "Local draft" });

    const deleted = await remixRoute.request(`/sessions/${created.thread.id}`, {
      method: "DELETE",
    });
    expect(deleted.status).toBe(200);
    expect(
      getDb()
        .prepare("SELECT COUNT(*) AS n FROM remix_threads WHERE id = ?")
        .get(created.thread.id),
    ).toEqual({ n: 0 });
  });

  it("accepts a full active conversation and retains the newest local snapshot", async () => {
    getDb()
      .prepare(
        `INSERT INTO model_configs
          (provider, model_id, model_name, type, is_default)
         VALUES ('local-llm', 'local-llm/qwen', 'Qwen', 'remix', 1)`,
      )
      .run();
    const created = (await (
      await remixRoute.request("/sessions", { method: "POST" })
    ).json()) as { thread: { id: string } };
    const messages = Array.from({ length: 41 }, (_, index) => ({
      id: `message-${index}`,
      role: "user",
      parts: [],
    }));

    const saved = await remixRoute.request(
      `/sessions/${created.thread.id}/messages`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages }),
      },
    );

    expect(saved.status).toBe(200);
    expect(
      getDb()
        .prepare("SELECT COUNT(*) AS n FROM remix_messages WHERE thread_id = ?")
        .get(created.thread.id),
    ).toEqual({ n: 40 });
  });
});
