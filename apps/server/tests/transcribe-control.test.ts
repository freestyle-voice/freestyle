import { PluginRegistry } from "freestyle-voice";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SETTINGS_KEYS } from "../../electron/src/shared/settings-keys.js";
import { getDb } from "../src/lib/db.js";

// End-to-end coverage for the `/api/transcribe` pipeline-control paths: a
// plugin that calls `consume()`/`abort()` in a server hook must blank the
// delivered output, report the right `disposition`, skip LLM cleanup, and emit
// exactly one abort event. The registry-level semantics are unit-tested in the
// SDK; this exercises the route's threading of `api.control` across stages.

vi.mock("../src/lib/streaming/registry.js", () => ({
  getProvider: () => ({
    transcribe: vi.fn().mockResolvedValue({ text: "raw route text" }),
  }),
}));

vi.mock("../src/lib/streaming-stt.js", () => ({
  getApiKeyForProvider: () => "test-key",
}));

// The cleanup call must never run once a hook consumes/aborts — spy on it so we
// can assert it was skipped.
const postProcessSpy = vi.fn().mockResolvedValue({
  cleaned: "clean route text",
  llmProvider: "test-llm",
  llmModel: "test-cleaner",
  inputTokens: 10,
  outputTokens: 5,
  costUsd: 0.001,
});

vi.mock("../src/lib/post-process.js", () => ({
  postProcess: postProcessSpy,
  resolveAppContextForCleanup: (appContext: string | null) => appContext,
  getEffectiveCleanupTones: () => ({}),
  getCleanupAppAssignments: () => [],
}));

const registry = { current: new PluginRegistry() };

vi.mock("../src/lib/plugins/index.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/lib/plugins/index.js")>();
  return { ...actual, plugins: () => registry.current };
});

const { default: createApp } = await import("../src/index.js");
const app = createApp();

function transcribe(): Promise<Response> {
  return app.request("/api/transcribe", {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
      "x-audio-duration-ms": "1000",
    },
    body: new Uint8Array([1, 2, 3, 4]),
  });
}

interface TranscribeBody {
  raw: string;
  cleaned: string;
  disposition?: string;
  reason?: string;
}

describe("POST /api/transcribe — pipeline control", () => {
  beforeEach(() => {
    registry.current = new PluginRegistry();
    postProcessSpy.mockClear();
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

  it("blanks output and reports 'suppressed' when afterTranscribe consumes", async () => {
    registry.current = new PluginRegistry([
      {
        name: "consumer",
        afterTranscribe: (_input, _output, api) => {
          api.control.consume("handled");
        },
      },
    ]);

    const res = await transcribe();
    expect(res.status).toBe(200);
    const data = (await res.json()) as TranscribeBody;
    expect(data.disposition).toBe("suppressed");
    expect(data.reason).toBe("handled");
    // A consumed dictation delivers nothing and never spends an LLM call.
    expect(data.raw).toBe("");
    expect(data.cleaned).toBe("");
    expect(postProcessSpy).not.toHaveBeenCalled();
  });

  it("blanks output, reports 'aborted', and emits one pipelineError when afterTranscribe aborts", async () => {
    registry.current = new PluginRegistry([
      {
        name: "aborter",
        afterTranscribe: (_input, _output, api) => {
          api.control.abort("bad audio");
        },
      },
    ]);
    const emit = vi.spyOn(registry.current, "emit");

    const res = await transcribe();
    expect(res.status).toBe(200);
    const data = (await res.json()) as TranscribeBody;
    expect(data.disposition).toBe("aborted");
    expect(data.reason).toBe("bad audio");
    expect(data.raw).toBe("");
    expect(data.cleaned).toBe("");
    expect(postProcessSpy).not.toHaveBeenCalled();

    const abortEmits = emit.mock.calls.filter(
      ([event]) =>
        (event as { type?: string; stage?: string }).type === "pipelineError" &&
        (event as { stage?: string }).stage === "transcribe",
    );
    // The abort event must fire exactly once, not once per early-return guard.
    expect(abortEmits).toHaveLength(1);
    expect(abortEmits[0][0]).toMatchObject({ message: "bad audio" });
  });

  it("runs cleanup and reports 'deliver' when hooks leave control running", async () => {
    registry.current = new PluginRegistry([
      {
        name: "editor",
        afterTranscribe: (_input, output) => {
          output.text = output.text.toUpperCase();
        },
      },
    ]);

    const res = await transcribe();
    expect(res.status).toBe(200);
    const data = (await res.json()) as TranscribeBody;
    expect(data.disposition).toBe("deliver");
    expect(data.cleaned).toBe("clean route text");
    expect(postProcessSpy).toHaveBeenCalledTimes(1);
    // The uppercased transcript is what cleanup receives.
    expect(postProcessSpy.mock.calls[0][0]).toBe("RAW ROUTE TEXT");
  });
});
