import { PluginRegistry } from "freestyle-voice";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Inject a registry whose `beforeOutput` plugin drives the pipeline control
// object *without* touching `output.text`/`output.mode`. This is the case the
// deliver route used to mishandle: a plugin calling `consume()`/`abort()` was
// ignored unless it also emptied the text or set mode "none".
const registry = { current: new PluginRegistry() };

vi.mock("../src/lib/plugins/index.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/lib/plugins/index.js")>();
  return { ...actual, plugins: () => registry.current };
});

const { default: createApp } = await import("../src/index.js");
const app = createApp();

function deliver(text: string) {
  return app.request("/api/output/deliver", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, mode: "paste" }),
  });
}

describe("POST /api/output/deliver — pipeline control", () => {
  beforeEach(() => {
    registry.current = new PluginRegistry();
  });

  it("suppresses delivery when a beforeOutput plugin consumes, even with text left intact", async () => {
    registry.current = new PluginRegistry([
      {
        name: "consumer",
        beforeOutput: (_input, _output, api) => {
          api.control.consume("handled");
        },
      },
    ]);

    const res = await deliver("hello world");
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      output: { mode: string };
      disposition: string;
      reason?: string;
    };
    expect(data.disposition).toBe("suppressed");
    expect(data.output.mode).toBe("none");
    expect(data.reason).toBe("handled");
  });

  it("reports aborted when a beforeOutput plugin aborts", async () => {
    registry.current = new PluginRegistry([
      {
        name: "aborter",
        beforeOutput: (_input, _output, api) => {
          api.control.abort("bad");
        },
      },
    ]);

    const res = await deliver("hello world");
    const data = (await res.json()) as { disposition: string };
    expect(data.disposition).toBe("aborted");
  });

  it("still delivers when the plugin only edits text and leaves control running", async () => {
    registry.current = new PluginRegistry([
      {
        name: "editor",
        beforeOutput: (_input, output) => {
          output.text = output.text.toUpperCase();
        },
      },
    ]);

    const res = await deliver("hello");
    const data = (await res.json()) as {
      output: { text: string; mode: string };
      disposition: string;
    };
    expect(data.disposition).toBe("deliver");
    expect(data.output).toEqual({ text: "HELLO", mode: "paste" });
  });

  it("emits outputDelivered{none} on suppression (the path Electron never reaches)", async () => {
    registry.current = new PluginRegistry([
      {
        name: "consumer",
        beforeOutput: (_i, _o, api) => api.control.consume(),
      },
    ]);
    const emit = vi.spyOn(registry.current, "emit");

    await deliver("hello");

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ type: "outputDelivered", mode: "none" }),
    );
  });

  it("emits a pipelineError on abort", async () => {
    registry.current = new PluginRegistry([
      {
        name: "aborter",
        beforeOutput: (_i, _o, api) => api.control.abort("x"),
      },
    ]);
    const emit = vi.spyOn(registry.current, "emit");

    await deliver("hello");

    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "pipelineError",
        stage: "output",
        message: "x",
      }),
    );
  });

  it("does NOT emit on the deliver path (Electron owns that event)", async () => {
    registry.current = new PluginRegistry([
      {
        name: "editor",
        beforeOutput: (_i, output) => {
          output.text = output.text.toUpperCase();
        },
      },
    ]);
    const emit = vi.spyOn(registry.current, "emit");

    await deliver("hello");

    expect(emit).not.toHaveBeenCalled();
  });
});
