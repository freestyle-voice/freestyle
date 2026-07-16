import { beforeEach, describe, expect, it, vi } from "vitest";
import { SETTINGS_KEYS } from "../../electron/src/shared/settings-keys.js";
import { getDb } from "../src/lib/db.js";

vi.mock("../src/lib/streaming/registry.js", () => ({
  getProvider: () => ({
    transcribe: vi.fn().mockResolvedValue({ text: "raw route text" }),
  }),
}));

vi.mock("../src/lib/streaming-stt.js", () => ({
  getApiKeyForProvider: () => "test-key",
}));

vi.mock("../src/lib/post-process.js", () => ({
  postProcess: vi.fn().mockResolvedValue({
    cleaned: "clean route text",
    llmProvider: "test-llm",
    llmModel: "test-cleaner",
    inputTokens: 10,
    outputTokens: 5,
    costUsd: 0.001,
  }),
  resolveAppContextForCleanup: (appContext: string | null) => appContext,
  getCleanupAppAssignments: () => [],
}));

const { default: createApp } = await import("../src/index.js");
const app = createApp();

function transcribe(skipPostProcess = false): Promise<Response> {
  return app.request("/api/transcribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "x-audio-duration-ms": "1000",
      ...(skipPostProcess ? { "x-skip-post-process": "true" } : {}),
    },
    body: new Uint8Array([1, 2, 3, 4]),
  });
}

function historyCount(): number {
  const row = getDb()
    .prepare("SELECT COUNT(*) as count FROM transcription_history")
    .get() as { count: number };
  return row.count;
}

describe("history pause transcribe integration", () => {
  beforeEach(() => {
    const db = getDb();
    db.exec("DELETE FROM transcription_history");
    db.exec("DELETE FROM model_configs");
    db.prepare("DELETE FROM settings WHERE key = ?").run(
      SETTINGS_KEYS.historyPaused,
    );
    db.prepare(
      `INSERT INTO model_configs
         (provider, model_id, model_name, type, is_default)
         VALUES (?, ?, ?, 'voice', 1)`,
    ).run("test-provider", "test-model", "Test Model");
  });

  it("does not save raw transcribe history while paused", async () => {
    getDb()
      .prepare("INSERT INTO settings (key, value) VALUES (?, ?)")
      .run(SETTINGS_KEYS.historyPaused, "true");

    const res = await transcribe(true);

    expect(res.status).toBe(200);
    expect(historyCount()).toBe(0);
  });

  it("does not save processed transcribe history while paused", async () => {
    getDb()
      .prepare("INSERT INTO settings (key, value) VALUES (?, ?)")
      .run(SETTINGS_KEYS.historyPaused, "true");

    const res = await transcribe(false);

    expect(res.status).toBe(200);
    expect(historyCount()).toBe(0);
  });

  it("saves transcribe history when not paused", async () => {
    const res = await transcribe(false);

    expect(res.status).toBe(200);
    expect(historyCount()).toBe(1);
  });
});
