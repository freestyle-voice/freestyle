import type { Plugin } from "@freestyle/sdk";
import {
  FreestyleEventType,
  PluginRegistry,
  sortPlugins,
} from "@freestyle/sdk";
import { describe, expect, it, vi } from "vitest";

describe("PluginRegistry", () => {
  it("runs afterCleanup across plugins in order, chaining output", async () => {
    const a: Plugin = {
      name: "a",
      afterCleanup: (_i, o) => {
        o.text = `${o.text}-a`;
      },
    };
    const b: Plugin = {
      name: "b",
      afterCleanup: (_i, o) => {
        o.text = `${o.text}-b`;
      },
    };
    const registry = new PluginRegistry([a, b]);

    const result = await registry.run("afterCleanup", {}, { text: "start" });

    expect(result.text).toBe("start-a-b");
  });

  it("isolates a throwing plugin so the chain continues", async () => {
    const bad: Plugin = {
      name: "bad",
      afterCleanup: () => {
        throw new Error("boom");
      },
    };
    const good: Plugin = {
      name: "good",
      afterCleanup: (_i, o) => {
        o.text = o.text.toUpperCase();
      },
    };
    const registry = new PluginRegistry([bad, good]);

    const result = await registry.run("afterCleanup", {}, { text: "ok" });

    expect(result.text).toBe("OK");
  });

  it("runs hooks in enforce order (pre -> none -> post), then load order", async () => {
    const make = (name: string, enforce?: "pre" | "post"): Plugin => ({
      name,
      ...(enforce ? { enforce } : {}),
      afterCleanup: (_i, o) => {
        o.text = `${o.text}-${name}`;
      },
    });
    // Load order is post, none, pre — sortPlugins must reorder to pre/none/post.
    const ordered = sortPlugins([
      make("late", "post"),
      make("mid"),
      make("early", "pre"),
    ]);
    const registry = new PluginRegistry(ordered);

    const result = await registry.run("afterCleanup", {}, { text: "x" });

    expect(result.text).toBe("x-early-mid-late");
  });

  it("deep-merges config partials in order", async () => {
    const a: Plugin = {
      name: "a",
      config: () => ({ nested: { x: 1 }, top: "a" }),
    };
    const b: Plugin = {
      name: "b",
      config: () => ({ nested: { y: 2 }, top: "b" }),
    };
    const registry = new PluginRegistry([a, b]);

    const merged = await registry.resolveConfig({});

    expect(merged).toEqual({ nested: { x: 1, y: 2 }, top: "b" });
  });

  it("broadcasts events to every plugin's event hook", async () => {
    const seen: string[] = [];
    const a: Plugin = {
      name: "a",
      event: ({ event }) => {
        seen.push(`a:${event.type}`);
      },
    };
    const b: Plugin = {
      name: "b",
      event: ({ event }) => {
        seen.push(`b:${event.type}`);
      },
    };
    const registry = new PluginRegistry([a, b]);

    await registry.emit({
      type: FreestyleEventType.Transcribed,
      text: "hi",
    });

    expect(seen).toEqual(["a:transcribed", "b:transcribed"]);
  });

  it("runs dispose for each plugin, and only once across repeated calls", async () => {
    const disposeA = vi.fn();
    const disposeB = vi.fn();
    const registry = new PluginRegistry([
      { name: "a", dispose: disposeA },
      { name: "b", dispose: disposeB },
    ]);

    await registry.dispose();
    await registry.dispose();

    expect(disposeA).toHaveBeenCalledOnce();
    expect(disposeB).toHaveBeenCalledOnce();
  });

  it("routes hook-handler failures to onError", async () => {
    const onError = vi.fn();
    const registry = new PluginRegistry(
      [
        {
          name: "boom",
          afterCleanup: () => {
            throw new Error("nope");
          },
        },
      ],
      { onError },
    );

    await registry.run("afterCleanup", {}, { text: "x" });

    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]?.[0]).toMatchObject({
      plugin: "boom",
      hook: "afterCleanup",
    });
  });
});
