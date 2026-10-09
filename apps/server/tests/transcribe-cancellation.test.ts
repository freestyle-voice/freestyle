import { createHookApi as createSdkHookApi } from "freestyle-voice";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "../src/lib/db.js";
import { plugins } from "../src/lib/plugins/index.js";

const { transcribe, cleanup, captureException, hookApi } = vi.hoisted(() => ({
  transcribe: vi.fn(),
  cleanup: vi.fn(),
  captureException: vi.fn(),
  hookApi: vi.fn(),
}));
vi.mock("../src/lib/plugins/pipeline.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  createHookApi: hookApi,
}));
vi.mock("../src/lib/streaming/registry.js", () => ({
  getProvider: () => ({ transcribe }),
}));
vi.mock("../src/lib/streaming-stt.js", () => ({
  getApiKeyForProvider: () => "test",
  voiceProviderCategory: () => "byok",
}));
vi.mock("../src/lib/sentry.js", () => ({ capture: vi.fn(), captureException }));
vi.mock("../src/lib/post-process.js", () => ({
  postProcess: cleanup,
  resolveAppContextForCleanup: (ctx: string | null) => ctx,
  getCleanupAppAssignments: () => [],
}));
const { default: route, MAX_TRANSCRIBE_BYTES } = await import(
  "../src/routes/transcribe.js"
);
const { default: cleanupRoute } = await import(
  "../src/routes/post-process-route.js"
);
beforeEach(() => {
  hookApi.mockReset();
  hookApi.mockResolvedValue(createSdkHookApi());
  transcribe.mockReset();
  cleanup.mockReset();
  captureException.mockClear();
  const db = getDb();
  db.exec("DELETE FROM transcription_history; DELETE FROM model_configs");
  db.prepare(
    "INSERT INTO model_configs (provider, model_id, model_name, type, is_default) VALUES ('test', 'test', 'Test', 'voice', 1)",
  ).run();
});
function submit(controller: AbortController, skip = false) {
  return route.request("/", {
    method: "POST",
    body: new Uint8Array([1, 2]),
    signal: controller.signal,
    headers: {
      "content-type": "audio/wav",
      ...(skip ? { "x-skip-post-process": "true" } : {}),
    },
  });
}
function historyCount() {
  return (
    getDb()
      .prepare("SELECT count(*) as n FROM transcription_history")
      .get() as { n: number }
  ).n;
}

describe("canceled dictation routes", () => {
  it.each([
    false,
    true,
  ])("suppresses late STT/history even when provider ignores cancellation (skip cleanup=%s)", async (skip) => {
    const controller = new AbortController();
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let finish!: (value: { text: string }) => void;
    transcribe.mockImplementation((opts) => {
      expect(opts.signal.aborted).toBe(false);
      entered();
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const request = submit(controller, skip);
    await started;
    controller.abort();
    finish({ text: "canceled text" });
    expect(await (await request).json()).toMatchObject({
      raw: "",
      cleaned: "",
      disposition: "aborted",
    });
    expect(historyCount()).toBe(0);
    expect(cleanup).not.toHaveBeenCalled();
    expect(captureException).not.toHaveBeenCalled();
  });

  it("treats a provider abort as cancellation without reporting a provider defect", async () => {
    const controller = new AbortController();
    transcribe.mockImplementation(
      ({ signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
          controller.abort();
        }),
    );
    expect(await (await submit(controller)).json()).toMatchObject({
      disposition: "aborted",
    });
    expect(captureException).not.toHaveBeenCalled();
    expect(historyCount()).toBe(0);
  });

  it("forwards cancellation to cleanup and suppresses a late cleaned result", async () => {
    const controller = new AbortController();
    transcribe.mockResolvedValue({ text: "raw text" });
    cleanup.mockImplementation(async (_text, _ctx, options) => {
      expect(options.signal.aborted).toBe(false);
      controller.abort();
      return { cleaned: "late cleanup" };
    });
    expect(await (await submit(controller)).json()).toMatchObject({
      disposition: "aborted",
    });
    expect(historyCount()).toBe(0);
    expect(captureException).not.toHaveBeenCalled();
  });

  it("forwards the multi-segment request signal and suppresses a canceled cleanup response", async () => {
    const controller = new AbortController();
    cleanup.mockImplementation(async (_text, _ctx, options) => {
      expect(options.signal.aborted).toBe(false);
      controller.abort();
      return { cleaned: "late cleanup" };
    });
    const res = await cleanupRoute.request("/", {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "combined segments" }),
    });
    expect(await res.json()).toMatchObject({
      cleaned: "",
      disposition: "aborted",
    });
  });

  it("does not start beforeTranscribe after canceled hook API initialization", async () => {
    const controller = new AbortController();
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    let finish!: (value: ReturnType<typeof createSdkHookApi>) => void;
    hookApi.mockImplementation(() => {
      entered();
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const run = vi.spyOn(plugins(), "run");
    const request = submit(controller);
    await started;
    controller.abort();
    finish(createSdkHookApi());
    expect(await (await request).json()).toMatchObject({
      disposition: "aborted",
    });
    expect(run).not.toHaveBeenCalled();
    expect(transcribe).not.toHaveBeenCalled();
    run.mockRestore();
  });

  it("rejects oversized recordings before invoking STT", async () => {
    const res = await route.request("/", {
      method: "POST",
      headers: { "content-length": String(MAX_TRANSCRIBE_BYTES + 1) },
      body: "oversized",
    });
    expect(res.status).toBe(413);
    expect(transcribe).not.toHaveBeenCalled();
  });
});
