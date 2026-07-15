import { PluginRegistry } from "freestyle-voice";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { writeSetting } from "../src/lib/db.js";

// Companion to post-process-control.test.ts for the Freestyle Cloud cleanup
// branch: a `beforeCleanup` plugin's `skip`/`consume()`/`abort()` must
// short-circuit the remote cloud cleanup call too, matching the local-model
// branch and the documented consume/abort semantics. The cloud branch
// previously never ran `beforeCleanup` at all.

const FREESTYLE_CLOUD_PROVIDER_ID = "freestyle-cloud";

const cloudPostProcessSpy = vi.fn().mockResolvedValue({
  cleaned: "CLOUD CLEANED",
  usage: { inputTokens: 1, outputTokens: 1 },
});

vi.mock("../src/lib/providers.js", () => ({
  createChatModel: vi.fn().mockResolvedValue({}),
  getDefaultModels: () => ({
    llm: { provider: FREESTYLE_CLOUD_PROVIDER_ID, model_id: "post-process" },
  }),
}));

vi.mock("../src/lib/freestyle-cloud.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/lib/freestyle-cloud.js")>();
  return { ...actual, postProcessWithFreestyleCloud: cloudPostProcessSpy };
});

vi.mock("../src/lib/sessions.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/lib/sessions.js")>();
  return { ...actual, getSessionToken: () => "test-token" };
});

const registry = { current: new PluginRegistry() };
vi.mock("../src/lib/plugins/index.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/lib/plugins/index.js")>();
  return { ...actual, plugins: () => registry.current };
});

const { postProcess } = await import("../src/lib/post-process.js");
const { createHookApi } = await import("../src/lib/plugins/pipeline.js");

describe("postProcess — beforeCleanup control state (cloud cleanup)", () => {
  beforeEach(() => {
    registry.current = new PluginRegistry();
    cloudPostProcessSpy.mockClear();
    writeSetting("llm_cleanup", "true");
  });

  it("skips the cloud cleanup call when beforeCleanup consumes", async () => {
    registry.current = new PluginRegistry([
      {
        name: "consumer",
        beforeCleanup: (_input, _output, api) => api.control.consume("done"),
      },
    ]);
    const api = await createHookApi();

    const result = await postProcess("hello world", null, { api });

    expect(cloudPostProcessSpy).not.toHaveBeenCalled();
    expect(result.cleaned).toBe("hello world");
  });

  it("skips the cloud cleanup call when beforeCleanup sets skip", async () => {
    registry.current = new PluginRegistry([
      {
        name: "skipper",
        beforeCleanup: (_input, output) => {
          output.skip = true;
        },
      },
    ]);
    const api = await createHookApi();

    await postProcess("hello world", null, { api });

    expect(cloudPostProcessSpy).not.toHaveBeenCalled();
  });

  it("runs the cloud cleanup call when beforeCleanup leaves control running", async () => {
    registry.current = new PluginRegistry([
      { name: "noop", beforeCleanup: () => {} },
    ]);
    const api = await createHookApi();

    await postProcess("hello world", null, { api });

    expect(cloudPostProcessSpy).toHaveBeenCalledTimes(1);
  });
});
