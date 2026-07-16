import { PluginRegistry } from "freestyle-voice";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { writeSetting } from "../src/lib/db.js";

// Guards the `postProcess` control-state fix: a `beforeCleanup` plugin that
// calls `consume()`/`abort()` must skip the LLM cleanup call entirely, matching
// the documented consume/abort semantics ("every remaining stage is skipped")
// and the cloud branch's own early-out. Before the fix, only `promptHook.skip`
// short-circuited, so a consume/abort still spent an LLM round trip.

const createChatModelSpy = vi.fn().mockResolvedValue({});
const cleanupSpy = vi.fn().mockResolvedValue({
  model: "test-model",
  cleaned: "CLEANED",
  inputTokens: 1,
  outputTokens: 1,
});

vi.mock("../src/lib/providers.js", () => ({
  createChatModel: createChatModelSpy,
  getDefaultModels: () => ({
    llm: { provider: "test-llm", model_id: "test-model" },
  }),
}));

vi.mock("@freestyle-voice/stt", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@freestyle-voice/stt")>();
  return { ...actual, postProcess: cleanupSpy };
});

vi.mock("../src/routes/models.js", () => ({
  isCleanupModelSupported: () => Promise.resolve(true),
  getModelCost: () => Promise.resolve(null),
}));

const registry = { current: new PluginRegistry() };
vi.mock("../src/lib/plugins/index.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/lib/plugins/index.js")>();
  return { ...actual, plugins: () => registry.current };
});

const { postProcess } = await import("../src/lib/post-process.js");
const { createHookApi } = await import("../src/lib/plugins/pipeline.js");

describe("postProcess — beforeCleanup control state", () => {
  beforeEach(() => {
    registry.current = new PluginRegistry();
    createChatModelSpy.mockClear();
    cleanupSpy.mockClear();
    writeSetting("llm_cleanup", "true");
  });

  it("skips the LLM call when beforeCleanup consumes", async () => {
    registry.current = new PluginRegistry([
      {
        name: "consumer",
        beforeCleanup: (_input, _output, api) => api.control.consume("done"),
      },
    ]);
    const api = await createHookApi();

    const result = await postProcess("hello world", null, { api });

    expect(cleanupSpy).not.toHaveBeenCalled();
    // Text passes through unchanged (no cleanup happened).
    expect(result.cleaned).toBe("hello world");
  });

  it("skips the LLM call when beforeCleanup aborts", async () => {
    registry.current = new PluginRegistry([
      {
        name: "aborter",
        beforeCleanup: (_input, _output, api) => api.control.abort("nope"),
      },
    ]);
    const api = await createHookApi();

    await postProcess("hello world", null, { api });

    expect(cleanupSpy).not.toHaveBeenCalled();
  });

  it("still runs the LLM call when beforeCleanup leaves control running", async () => {
    registry.current = new PluginRegistry([
      {
        name: "editor",
        beforeCleanup: (_input, output) => {
          output.system.push("Be concise.");
        },
      },
    ]);
    const api = await createHookApi();

    await postProcess("hello world", null, { api });

    expect(cleanupSpy).toHaveBeenCalledTimes(1);
  });
});
