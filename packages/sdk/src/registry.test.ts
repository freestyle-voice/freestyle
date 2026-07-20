import { describe, expect, it } from "vitest";
import { createHookApi } from "./hook-api.js";
import type { Plugin } from "./plugin.js";
import { PluginRegistry } from "./registry.js";

function plugin(name: string, partial: Partial<Plugin> = {}): Plugin {
  return { name, ...partial };
}

describe("PluginRegistry.has", () => {
  it("is false when no plugin implements the hook", () => {
    const registry = new PluginRegistry([plugin("a")]);
    expect(registry.has("afterTranscribe")).toBe(false);
  });

  it("is true when any plugin implements the hook", () => {
    const registry = new PluginRegistry([
      plugin("a"),
      plugin("b", { afterTranscribe: (_i, _o) => {} }),
    ]);
    expect(registry.has("afterTranscribe")).toBe(true);
  });
});

describe("PluginRegistry.run", () => {
  it("runs every plugin in order, mutating the shared output", async () => {
    const order: string[] = [];
    const registry = new PluginRegistry([
      plugin("a", {
        afterCleanup: (_input, output) => {
          order.push("a");
          output.text += "-a";
        },
      }),
      plugin("b", {
        afterCleanup: (_input, output) => {
          order.push("b");
          output.text += "-b";
        },
      }),
    ]);

    const api = createHookApi();
    const result = await registry.run("afterCleanup", {}, { text: "raw" }, api);

    expect(order).toEqual(["a", "b"]);
    expect(result.text).toBe("raw-a-b");
    expect(api.control.state).toBe("running");
  });

  it("stopPropagation stops later plugins for that hook only", async () => {
    const order: string[] = [];
    const registry = new PluginRegistry([
      plugin("a", {
        afterCleanup: (_input, _output, api) => {
          order.push("a");
          api.control.stopPropagation();
        },
      }),
      plugin("b", {
        afterCleanup: () => {
          order.push("b");
        },
      }),
    ]);

    const api = createHookApi();
    await registry.run("afterCleanup", {}, { text: "raw" }, api);

    expect(order).toEqual(["a"]);
    // stopPropagation does not set a terminal state — the pipeline continues.
    expect(api.control.state).toBe("running");

    // A later hook on the SAME api should run normally: the per-hook flag was
    // reset, even though the earlier hook stopped propagation for itself.
    const order2: string[] = [];
    const registry2 = new PluginRegistry([
      plugin("c", {
        beforeOutput: () => {
          order2.push("c");
        },
      }),
    ]);
    await registry2.run(
      "beforeOutput",
      {},
      { text: "raw", mode: "paste" },
      api,
    );
    expect(order2).toEqual(["c"]);
  });

  it("consume() sets terminal state and stops the rest of this hook", async () => {
    const order: string[] = [];
    const registry = new PluginRegistry([
      plugin("a", {
        afterTranscribe: (_input, _output, api) => {
          order.push("a");
          api.control.consume("handled by a");
        },
      }),
      plugin("b", {
        afterTranscribe: () => {
          order.push("b");
        },
      }),
    ]);

    const api = createHookApi();
    await registry.run(
      "afterTranscribe",
      { providerId: "p", modelId: "m" },
      { text: "raw" },
      api,
    );

    expect(order).toEqual(["a"]);
    expect(api.control.state).toBe("consumed");
    expect(api.control.reason).toBe("handled by a");
  });

  it("abort() sets terminal state and aborts the shared signal", async () => {
    const registry = new PluginRegistry([
      plugin("a", {
        beforeTranscribe: (_input, _output, api) => {
          api.control.abort("bad audio");
        },
      }),
    ]);

    const api = createHookApi();
    let aborted = false;
    api.signal.addEventListener("abort", () => {
      aborted = true;
    });

    await registry.run(
      "beforeTranscribe",
      { providerId: "p", modelId: "m", audioDurationMs: 0 },
      { audio: new Uint8Array(), providerId: "p", modelId: "m" },
      api,
    );

    expect(api.control.state).toBe("aborted");
    expect(api.control.reason).toBe("bad audio");
    expect(aborted).toBe(true);
  });

  it("skips a later hook entirely once the pipeline is consumed", async () => {
    const order: string[] = [];
    const registry = new PluginRegistry([
      plugin("a", {
        afterCleanup: () => {
          order.push("a");
        },
      }),
    ]);

    const api = createHookApi();
    api.control.consume("done");

    // A consumed pipeline runs no further mutating hooks, and the output is
    // returned untouched.
    const result = await registry.run("afterCleanup", {}, { text: "raw" }, api);

    expect(order).toEqual([]);
    expect(result.text).toBe("raw");
  });

  it("swallows a throwing handler and continues with later plugins", async () => {
    const order: string[] = [];
    const failures: string[] = [];
    const registry = new PluginRegistry(
      [
        plugin("a", {
          afterCleanup: () => {
            throw new Error("boom");
          },
        }),
        plugin("b", {
          afterCleanup: () => {
            order.push("b");
          },
        }),
      ],
      { onError: ({ plugin: name }) => failures.push(name) },
    );

    const api = createHookApi();
    await registry.run("afterCleanup", {}, { text: "raw" }, api);

    expect(order).toEqual(["b"]);
    expect(failures).toEqual(["a"]);
    expect(api.control.state).toBe("running");
  });
});
