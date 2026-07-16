import { createOpenAI } from "@ai-sdk/openai";
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
  apiKey: "cloud-openai-key",
};

function createOpenAICallConfig(): unknown {
  return vi.mocked(createOpenAI).mock.calls[0]?.[0];
}

function setSetting(key: string, value: string): void {
  getDb()
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?)")
    .run(key, value);
}

describe("OpenAI STT custom endpoint provider", () => {
  beforeEach(() => {
    getDb()
      .prepare("DELETE FROM settings WHERE key IN (?, ?)")
      .run(SETTINGS_KEYS.openaiSttBaseUrl, SETTINGS_KEYS.openaiSttApiKey);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("uses the default provider config when no base URL is set", async () => {
    const provider = new OpenAITranscriptionProvider();

    const result = await provider.transcribe(opts);

    expect(result.text).toBe("mock transcript");
    expect(createOpenAICallConfig()).toEqual({ apiKey: "cloud-openai-key" });
  });

  it("uses the default provider config when the base URL is empty", async () => {
    setSetting(SETTINGS_KEYS.openaiSttBaseUrl, "");
    const provider = new OpenAITranscriptionProvider();

    await provider.transcribe(opts);

    expect(createOpenAICallConfig()).toEqual({ apiKey: "cloud-openai-key" });
  });

  it("forwards the verbatim base URL and STT key when configured", async () => {
    setSetting(SETTINGS_KEYS.openaiSttBaseUrl, "https://example.com/v1");
    setSetting(SETTINGS_KEYS.openaiSttApiKey, "stt-endpoint-key");
    const provider = new OpenAITranscriptionProvider();

    await provider.transcribe(opts);

    expect(createOpenAICallConfig()).toEqual({
      apiKey: "stt-endpoint-key",
      baseURL: "https://example.com/v1",
    });
  });

  it("trims whitespace and trailing slashes but does not append /v1", async () => {
    setSetting(SETTINGS_KEYS.openaiSttBaseUrl, "  http://localhost:10095/  ");
    const provider = new OpenAITranscriptionProvider();

    await provider.transcribe(opts);

    expect(createOpenAICallConfig()).toEqual({
      apiKey: "",
      baseURL: "http://localhost:10095",
    });
  });
});

describe("POST /api/settings/openai-stt/test", () => {
  const app = createApp();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function post(body: unknown) {
    return app.request("/api/settings/openai-stt/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  it("probes <url>/v1/models and returns discovered models", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: "whisper-1" }] }), {
        status: 200,
      }),
    );

    const res = await post({ url: "https://example.com", api_key: "k" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, models: ["whisper-1"] });
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://example.com/v1/models",
      expect.objectContaining({
        headers: { Authorization: "Bearer k" },
      }),
    );
  });

  it("returns 502 when the endpoint responds with an error status", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("nope", { status: 401, statusText: "Unauthorized" }),
    );

    const res = await post({ url: "https://example.com" });

    expect(res.status).toBe(502);
  });

  it("rejects an invalid URL with a 400", async () => {
    const res = await post({ url: "not-a-url" });
    expect(res.status).toBe(400);
  });
});
