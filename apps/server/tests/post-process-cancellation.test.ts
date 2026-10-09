import { createHookApi, PluginRegistry } from "freestyle-voice";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { writeSetting } from "../src/lib/db.js";

const {
  sdkCleanup,
  cloudCleanup,
  captureException,
  capture,
  defaults,
  modelSupported,
} = vi.hoisted(() => ({
  sdkCleanup: vi.fn(),
  cloudCleanup: vi.fn(),
  captureException: vi.fn(),
  capture: vi.fn(),
  modelSupported: vi.fn(),
  defaults: { llm: { provider: "test", model_id: "test-cleanup" } },
}));
vi.mock("@freestyle-voice/stt", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  postProcess: sdkCleanup,
}));
vi.mock("../src/lib/providers.js", () => ({
  getDefaultModels: () => defaults,
  createCleanupModel: async () => ({}),
  createChatModel: async () => ({}),
}));
vi.mock("../src/routes/models.js", () => ({
  isCleanupModelSupported: modelSupported,
  getModelCostCached: () => undefined,
}));
vi.mock("../src/lib/editor/prompt-config.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ensureCleanupPromptConfigFresh: async () => undefined,
}));
vi.mock("../src/lib/sentry.js", () => ({ captureException, capture }));
vi.mock("../src/lib/freestyle-cloud.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  postProcessWithFreestyleCloud: cloudCleanup,
}));
vi.mock("../src/lib/sessions.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getSessionToken: () => "test",
}));
const registry = new PluginRegistry();
vi.mock("../src/lib/plugins/index.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  plugins: () => registry,
}));
const { postProcess } = await import("../src/lib/post-process.js");
beforeEach(() => {
  modelSupported.mockReset();
  modelSupported.mockResolvedValue(true);
  sdkCleanup.mockReset();
  cloudCleanup.mockReset();
  capture.mockClear();
  captureException.mockClear();
  writeSetting("llm_cleanup", "true");
});

describe("cleanup cancellation", () => {
  it("does not start a cleanup hook after cancellation during model validation", async () => {
    defaults.llm.provider = "test";
    const controller = new AbortController();
    modelSupported.mockImplementation(async () => {
      controller.abort();
      return true;
    });
    const run = vi.spyOn(registry, "run");
    await expect(
      postProcess("raw text", null, {
        signal: controller.signal,
        api: createHookApi(),
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(run).not.toHaveBeenCalled();
    expect(sdkCleanup).not.toHaveBeenCalled();
    run.mockRestore();
  });

  it.each([
    "test",
    "freestyle-cloud",
  ])("passes the request signal to %s and does not report aborted cleanup as a provider error", async (provider) => {
    defaults.llm.provider = provider;
    const controller = new AbortController();
    if (provider === "test")
      sdkCleanup.mockImplementation(async (options) => {
        expect(options.signal).toBe(controller.signal);
        controller.abort();
        options.onError(controller.signal.reason);
        return { cleaned: "raw text", model: null };
      });
    else
      cloudCleanup.mockImplementation(async (options) => {
        expect(options.signal).toBe(controller.signal);
        controller.abort();
        throw controller.signal.reason;
      });
    await expect(
      postProcess("raw text", null, {
        signal: controller.signal,
        api: createHookApi(),
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(captureException).not.toHaveBeenCalled();
    expect(capture).not.toHaveBeenCalledWith(
      "post process failed",
      expect.anything(),
    );
    expect(capture).not.toHaveBeenCalledWith(
      "post process completed",
      expect.anything(),
    );
  });
});
