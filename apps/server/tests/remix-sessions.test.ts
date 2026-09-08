import { beforeEach, describe, expect, it } from "vitest";
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

describe("Remix local session boundary", () => {
  it("requires an account before recording managed-session metadata", async () => {
    const response = await remixRoute.request("/sessions", { method: "POST" });
    expect(response.status).toBe(401);
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
