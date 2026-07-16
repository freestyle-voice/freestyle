import { createOpenAI } from "@ai-sdk/openai";
import { normalizeOpenAISttBaseUrl } from "@freestyle-voice/validations";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SETTINGS_KEYS } from "../../electron/src/shared/settings-keys.js";
import createApp from "../src/index.js";
import { getDb } from "../src/lib/db.js";

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: vi.fn(() => ({
    transcription: vi.fn((id: string) => ({ id })),
  })),
}));

vi.mock("ai", async (importOriginal) => {
  const actual = await importOriginal<typeof import("ai")>();
  return {
    ...actual,
    experimental_transcribe: vi.fn(async () => ({
      text: "mock transcript",
      segments: undefined,
      durationInSeconds: undefined,
    })),
  };
});

const { OpenAITranscriptionProvider } = await import(
  "../src/lib/streaming/providers/openai.js"
);

const opts = {
  audio: new Uint8Array([1, 2, 3, 4]),
  model: "whisper-1",
  apiKey: "test-key",
};
const app = createApp();

function setSetting(key: string, value: string): void {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    )
    .run(key, value);
}

function readSetting(key: string): string | undefined {
  return (
    getDb().prepare("SELECT value FROM settings WHERE key = ?").get(key) as
      | { value: string }
      | undefined
  )?.value;
}

function requestOpenAISttTest(body: unknown): Promise<Response> {
  return app.request("/api/settings/openai-stt/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createOpenAICallConfig(): unknown {
  return vi.mocked(createOpenAI).mock.calls[0]?.[0];
}

describe("OpenAI STT base URL setting", () => {
  beforeEach(() => {
    getDb()
      .prepare("DELETE FROM settings WHERE key IN (?, ?)")
      .run(SETTINGS_KEYS.openaiSttBaseUrl, SETTINGS_KEYS.openaiSttApiKey);
    getDb().prepare("DELETE FROM api_keys WHERE provider = 'openai'").run();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it("preserves default provider config when no setting is present", async () => {
    const provider = new OpenAITranscriptionProvider();

    const result = await provider.transcribe(opts);

    expect(result).toEqual({
      text: "mock transcript",
      segments: undefined,
      durationInSeconds: undefined,
    });
    expect(createOpenAICallConfig()).toEqual({ apiKey: "test-key" });
  });

  it("uses an empty endpoint-specific key for an unauthenticated custom endpoint", async () => {
    setSetting(SETTINGS_KEYS.openaiSttBaseUrl, "https://example.com");
    const provider = new OpenAITranscriptionProvider();

    const result = await provider.transcribe(opts);

    expect(result.text).toBe("mock transcript");
    expect(createOpenAICallConfig()).toEqual({
      apiKey: "",
      baseURL: normalizeOpenAISttBaseUrl("https://example.com"),
    });
  });

  it("uses only the endpoint-specific key for a custom endpoint", async () => {
    setSetting(SETTINGS_KEYS.openaiSttBaseUrl, "https://example.com");
    setSetting(SETTINGS_KEYS.openaiSttApiKey, "custom-key");
    getDb()
      .prepare("INSERT INTO api_keys (provider, key) VALUES ('openai', ?)")
      .run("official-key");

    await new OpenAITranscriptionProvider().transcribe(opts);

    expect(createOpenAICallConfig()).toEqual({
      apiKey: "custom-key",
      baseURL: "https://example.com/v1",
    });
  });

  it("preserves default provider config when the setting is empty", async () => {
    getDb()
      .prepare("INSERT INTO settings (key, value) VALUES (?, ?)")
      .run(SETTINGS_KEYS.openaiSttBaseUrl, "");
    const provider = new OpenAITranscriptionProvider();

    const result = await provider.transcribe(opts);

    expect(result.text).toBe("mock transcript");
    expect(createOpenAICallConfig()).toEqual({ apiKey: "test-key" });
  });

  it("normalizes whitespace and trailing slash before forwarding", async () => {
    setSetting(SETTINGS_KEYS.openaiSttBaseUrl, "  http://localhost:10095/  ");
    const provider = new OpenAITranscriptionProvider();

    await provider.transcribe(opts);

    expect(createOpenAICallConfig()).toEqual({
      apiKey: "",
      baseURL: normalizeOpenAISttBaseUrl("  http://localhost:10095/  "),
    });
  });

  it("disables the official Realtime websocket for a custom URL", () => {
    const provider = new OpenAITranscriptionProvider();
    expect(provider.supportsStreaming("openai/gpt-4o-transcribe")).toBe(true);

    setSetting(SETTINGS_KEYS.openaiSttBaseUrl, "https://example.com/v1");
    expect(provider.supportsStreaming("openai/gpt-4o-transcribe")).toBe(false);
  });
});

describe("OpenAI STT connection test", () => {
  beforeEach(() => {
    getDb()
      .prepare("DELETE FROM settings WHERE key IN (?, ?)")
      .run(SETTINGS_KEYS.openaiSttBaseUrl, SETTINGS_KEYS.openaiSttApiKey);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([
    ["https://example.com/", "https://example.com/v1/models"],
    ["https://example.com/v1/", "https://example.com/v1/models"],
  ])("normalizes %s before testing and persisting", async (url, expected) => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await requestOpenAISttTest({ url });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      expected,
      expect.objectContaining({ headers: {} }),
    );
    expect(readSetting(SETTINGS_KEYS.openaiSttBaseUrl)).toBe(
      "https://example.com/v1",
    );
    expect(readSetting(SETTINGS_KEYS.openaiSttApiKey)).toBeUndefined();
  });

  it("sends the optional custom key only to the configured endpoint", async () => {
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await requestOpenAISttTest({
      url: "http://localhost:10095",
      api_key: "custom-secret",
    });
    const body = await res.json();

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:10095/v1/models",
      expect.objectContaining({
        headers: { Authorization: "Bearer custom-secret" },
      }),
    );
    expect(readSetting(SETTINGS_KEYS.openaiSttApiKey)).toBe("custom-secret");
    expect(body).toEqual({
      ok: true,
      url: "http://localhost:10095/v1",
      api_key_configured: true,
    });
    expect(JSON.stringify(body)).not.toContain("custom-secret");
  });

  it("rejects an invalid URL without making a request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await requestOpenAISttTest({ url: "not-a-url" });

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not overwrite a working configuration when the test fails", async () => {
    setSetting(SETTINGS_KEYS.openaiSttBaseUrl, "https://working.example/v1");
    setSetting(SETTINGS_KEYS.openaiSttApiKey, "working-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("", { status: 503, statusText: "Unavailable" }),
      ),
    );

    const res = await requestOpenAISttTest({
      url: "https://broken.example",
      api_key: "replacement-key",
    });

    expect(res.status).toBe(502);
    expect(readSetting(SETTINGS_KEYS.openaiSttBaseUrl)).toBe(
      "https://working.example/v1",
    );
    expect(readSetting(SETTINGS_KEYS.openaiSttApiKey)).toBe("working-key");
  });

  it("preserves a saved key when a later test omits the key field", async () => {
    setSetting(SETTINGS_KEYS.openaiSttApiKey, "saved-key");
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const res = await requestOpenAISttTest({ url: "https://example.com" });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/v1/models",
      expect.objectContaining({
        headers: { Authorization: "Bearer saved-key" },
      }),
    );
    expect(readSetting(SETTINGS_KEYS.openaiSttApiKey)).toBe("saved-key");
  });

  it("redacts the custom key from settings responses", async () => {
    setSetting(SETTINGS_KEYS.openaiSttBaseUrl, "https://example.com/v1");
    setSetting(SETTINGS_KEYS.openaiSttApiKey, "custom-secret");

    const allRes = await app.request("/api/settings");
    const all = await allRes.json();
    const keyRes = await app.request(
      `/api/settings/${SETTINGS_KEYS.openaiSttApiKey}`,
    );
    const key = await keyRes.json();

    expect(all[SETTINGS_KEYS.openaiSttApiKey]).toBe("");
    expect(key).toEqual({
      key: SETTINGS_KEYS.openaiSttApiKey,
      value: "",
    });
    expect(JSON.stringify({ all, key })).not.toContain("custom-secret");
  });

  it("clears both custom settings and restores official provider behavior", async () => {
    setSetting(SETTINGS_KEYS.openaiSttBaseUrl, "https://example.com/v1");
    setSetting(SETTINGS_KEYS.openaiSttApiKey, "custom-key");

    const clearRes = await app.request("/api/settings/openai-stt", {
      method: "DELETE",
    });
    await new OpenAITranscriptionProvider().transcribe(opts);

    expect(clearRes.status).toBe(200);
    expect(readSetting(SETTINGS_KEYS.openaiSttBaseUrl)).toBeUndefined();
    expect(readSetting(SETTINGS_KEYS.openaiSttApiKey)).toBeUndefined();
    expect(createOpenAICallConfig()).toEqual({ apiKey: "test-key" });
  });
});
