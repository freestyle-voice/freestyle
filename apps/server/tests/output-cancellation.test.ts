import { PluginRegistry } from "freestyle-voice";
import { describe, expect, it, vi } from "vitest";

const state = { registry: new PluginRegistry() };
vi.mock("../src/lib/plugins/index.js", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  plugins: () => state.registry,
}));
const { default: outputRoute } = await import("../src/routes/output.js");
describe("canceled output hook requests", () => {
  it("drops a late plugin result and emits no output events after cancellation", async () => {
    let finish!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    state.registry = new PluginRegistry([
      {
        name: "slow-output",
        beforeOutput: async () => {
          entered();
          await new Promise<void>((resolve) => {
            finish = resolve;
          });
        },
      },
    ]);
    const emit = vi.spyOn(state.registry, "emit");
    const controller = new AbortController();
    const request = outputRoute.request("/deliver", {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "late text", mode: "paste" }),
    });
    await started;
    controller.abort();
    finish();
    expect(await (await request).json()).toMatchObject({
      output: { text: "", mode: "none" },
      disposition: "aborted",
    });
    expect(emit).not.toHaveBeenCalled();
  });
});
