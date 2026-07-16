import { PluginRegistry } from "freestyle-voice";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SETTINGS_KEYS } from "../../electron/src/shared/settings-keys.js";
import { getDb, writeSetting } from "../src/lib/db.js";

// Guards the combined-mode Freestyle Cloud path (`/api/transcribe`) threading
// of `beforeCleanup`:
//   - `system` fragments are forwarded and combined mode is kept.
//   - `skip`/`consume()`/`abort()`/`prompt` override drop out of combined mode
//     (mode: "raw") so the local post-process path honors the hook, mirroring
//     the local/BYOK flow. Previously the combined path forwarded fragments but
//     silently ran cloud cleanup even when the plugin asked to skip it.

const FREESTYLE_CLOUD_PROVIDER_ID = "freestyle-cloud";

const cloudTranscribeSpy = vi.fn(
  async (opts: { mode?: string; systemFragments?: string[] }) => ({
    raw: "raw cloud text",
    cleaned: opts.mode === "combined" ? "cleaned cloud text" : "raw cloud text",
    usage: { inputTokens: 1, outputTokens: 1 },
  }),
);

vi.mock("../src/lib/freestyle-cloud.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/lib/freestyle-cloud.js")>();
  return { ...actual, transcribeWithFreestyleCloud: cloudTranscribeSpy };
});

vi.mock("../src/lib/providers.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/lib/providers.js")>();
  return {
    ...actual,
    getDefaultModels: () => ({
      voice: {
        provider: FREESTYLE_CLOUD_PROVIDER_ID,
        model_id: "freestyle-cloud/stt",
      },
      llm: {
        provider: FREESTYLE_CLOUD_PROVIDER_ID,
        model_id: "freestyle-cloud/post-process",
      },
    }),
  };
});

vi.mock("../src/lib/streaming-stt.js", () => ({
  getApiKeyForProvider: () => "test-token",
}));

// Local post-process must not be reached on the combined happy path; when the
// plugin skips we do fall through to it, so give it a passthrough impl.
const postProcessSpy = vi.fn().mockResolvedValue({
  cleaned: "local cleaned",
  llmProvider: "local",
  llmModel: "local-model",
  inputTokens: 0,
  outputTokens: 0,
  costUsd: 0,
  destination: "overall",
});

vi.mock("../src/lib/post-process.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/lib/post-process.js")>();
  return { ...actual, postProcess: postProcessSpy };
});

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

function lastCallOpts(): { mode?: string; systemFragments?: string[] } {
  const calls = cloudTranscribeSpy.mock.calls;
  return calls[calls.length - 1][0];
}

describe("POST /api/transcribe — combined cloud + beforeCleanup", () => {
  beforeEach(() => {
    registry.current = new PluginRegistry();
    cloudTranscribeSpy.mockClear();
    postProcessSpy.mockClear();
    writeSetting("llm_cleanup", "true");
    const db = getDb();
    db.exec("DELETE FROM transcription_history");
    db.prepare("DELETE FROM settings WHERE key = ?").run(
      SETTINGS_KEYS.historyPaused,
    );
  });

  it("keeps combined mode and forwards system fragments", async () => {
    registry.current = new PluginRegistry([
      {
        name: "fragment",
        beforeCleanup: (_input, output) => {
          output.system.push("Add emoji.");
        },
      },
    ]);

    const res = await transcribe();
    expect(res.status).toBe(200);
    const opts = lastCallOpts();
    expect(opts.mode).toBe("combined");
    expect(opts.systemFragments).toEqual(["Add emoji."]);
    // Combined mode does its cleanup remotely — never touches local postProcess.
    expect(postProcessSpy).not.toHaveBeenCalled();
  });

  it("drops to raw mode (no cloud cleanup) when beforeCleanup sets skip", async () => {
    registry.current = new PluginRegistry([
      {
        name: "skipper",
        beforeCleanup: (_input, output) => {
          output.skip = true;
        },
      },
    ]);

    const res = await transcribe();
    expect(res.status).toBe(200);
    const opts = lastCallOpts();
    expect(opts.mode).toBe("raw");
    expect(opts.systemFragments).toBeUndefined();
  });

  it("drops to raw mode when beforeCleanup overrides the prompt", async () => {
    registry.current = new PluginRegistry([
      {
        name: "overrider",
        beforeCleanup: (_input, output) => {
          output.prompt = "Rewrite as a pirate.";
        },
      },
    ]);

    const res = await transcribe();
    expect(res.status).toBe(200);
    expect(lastCallOpts().mode).toBe("raw");
  });

  it("drops to raw mode when beforeCleanup consumes", async () => {
    registry.current = new PluginRegistry([
      {
        name: "consumer",
        beforeCleanup: (_input, _output, api) => api.control.consume("done"),
      },
    ]);

    const res = await transcribe();
    expect(res.status).toBe(200);
    expect(lastCallOpts().mode).toBe("raw");
  });
});
