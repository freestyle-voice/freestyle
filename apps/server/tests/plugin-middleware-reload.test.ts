import type { Plugin } from "freestyle-voice";
import { PluginRegistry } from "freestyle-voice";
import { afterEach, describe, expect, it, vi } from "vitest";

// The middleware dispatcher reads the *live* registry via `plugins()` on every
// request, so a runtime reload (enable/disable/install) mounts/unmounts a
// plugin's contributed routes without reconstructing the app. We drive the
// registry directly here rather than importing an on-disk plugin, which the
// Vitest module runner can't dynamic-import.
const registryHolder: { current: PluginRegistry } = {
  current: new PluginRegistry([]),
};

vi.mock("../src/lib/plugins/index.js", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/lib/plugins/index.js")>();
  return {
    ...actual,
    plugins: () => registryHolder.current,
  };
});

const { default: createApp } = await import("../src/index.js");

const app = createApp();

const ROUTE = "/api/plugins/freestyle-voice-reload-mw-fixture/ping";

const fixture: Plugin = {
  name: "@freestyle-voice/reload-mw-fixture",
  middleware: [
    async (c, next) => {
      if (c.req.path === ROUTE) return c.json({ pong: true });
      return next();
    },
  ],
};

afterEach(() => {
  registryHolder.current = new PluginRegistry([]);
});

describe("plugin middleware takes effect on runtime reload", () => {
  it("does not serve the route before the plugin is present", async () => {
    const res = await app.request(ROUTE);
    expect(res.status).toBe(404);
  });

  it("serves the route after the plugin is added to the live registry", async () => {
    registryHolder.current = new PluginRegistry([fixture]);

    const res = await app.request(ROUTE);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pong: true });
  });

  it("stops serving the route after the plugin is removed", async () => {
    registryHolder.current = new PluginRegistry([fixture]);
    expect((await app.request(ROUTE)).status).toBe(200);

    registryHolder.current = new PluginRegistry([]);
    const res = await app.request(ROUTE);
    expect(res.status).toBe(404);
  });

  it("falls through to the next plugin when the first defers", async () => {
    const passthrough: Plugin = {
      name: "@freestyle-voice/passthrough",
      middleware: [async (_c, next) => next()],
    };
    registryHolder.current = new PluginRegistry([passthrough, fixture]);

    const res = await app.request(ROUTE);
    expect(res.status).toBe(200);
  });
});
