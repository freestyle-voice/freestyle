import { describe, expect, it } from "vitest";
import createApp from "../src/index.js";
import { getDb } from "../src/lib/db.js";
import { getDefaultModels } from "../src/lib/providers.js";

const app = createApp();

describe("dictation-only server", () => {
  it.each([
    ["POST", "/api/remix"],
    ["GET", "/api/remix/runtime"],
    ["GET", "/api/agent/thread/list"],
    ["GET", "/api/agent/activity"],
    ["POST", "/api/agent-os/execute"],
    ["GET", "/api/mcp/connections"],
    ["GET", "/api/brain/list"],
    ["GET", "/api/attention"],
    ["GET", "/api/connectors"],
    ["GET", "/api/scheduled/tasks"],
    ["GET", "/api/suggestions"],
    ["POST", "/api/notifications/token"],
  ])("does not expose %s %s", async (method, path) => {
    const response = await app.request(path, { method });
    expect(response.status).toBe(404);
  });

  it("continues to deliver dictation through the output pipeline", async () => {
    const response = await app.request("/api/output/deliver", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "Dictated text.", mode: "paste" }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      output: { text: "Dictated text.", mode: "paste" },
      disposition: "deliver",
    });
  });

  it("keeps legacy agent models on disk without exposing or selecting them", async () => {
    const db = getDb();
    const { lastInsertRowid } = db
      .prepare(
        "INSERT INTO model_configs (provider, model_id, model_name, type, is_default) VALUES (?, ?, ?, 'remix', 1)",
      )
      .run("local-llm", "legacy-agent", "Legacy agent");
    const response = await app.request("/api/models/configured");
    expect(response.status).toBe(200);
    expect(await response.json()).not.toContainEqual(
      expect.objectContaining({ type: "remix" }),
    );
    expect(getDefaultModels()).toEqual({ voice: null, llm: null });
    const select = await app.request(
      `/api/models/configured/${lastInsertRowid}/default`,
      { method: "PUT" },
    );
    expect(select.status).toBe(404);
    expect(
      db
        .prepare("SELECT type FROM model_configs WHERE id = ?")
        .get(lastInsertRowid),
    ).toEqual(expect.objectContaining({ type: "remix" }));
  });

  it("rejects new agent model configuration", async () => {
    const response = await app.request("/api/models/configured", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: "local-llm",
        model_id: "agent",
        model_name: "Agent",
        type: "remix",
      }),
    });
    expect(response.status).toBe(400);
  });
});
