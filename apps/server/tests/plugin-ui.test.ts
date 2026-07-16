import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pluginSlug } from "freestyle-voice";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import createApp from "../src/index.js";
import { writeSetting } from "../src/lib/db.js";

const app = createApp();

const PLUGIN_NAME = "@freestyle-voice/example-plugin";
const slug = pluginSlug(PLUGIN_NAME);

beforeAll(() => {
  // FREESTYLE_DB_PATH is set by tests/setup.ts (in beforeAll) to
  // <tmpdir>/test.db, so the server's plugins dir resolves to <tmpdir>/plugins.
  const pluginsDir = path.join(
    path.dirname(process.env.FREESTYLE_DB_PATH as string),
    "plugins",
  );
  const pkgDir = path.join(pluginsDir, slug);
  mkdirSync(path.join(pkgDir, "dist", "ui"), { recursive: true });
  writeFileSync(
    path.join(pkgDir, "package.json"),
    JSON.stringify({
      name: "@freestyle-voice/example-plugin",
      version: "1.2.3",
      description: "An example",
      freestyle: {
        displayName: "Example",
        contributes: {
          pages: [{ id: "main", title: "Main", entry: "dist/ui/index.html" }],
        },
      },
    }),
  );
  writeFileSync(
    path.join(pkgDir, "dist", "ui", "index.html"),
    "<!doctype html><title>hi</title>",
  );
  writeFileSync(path.join(pkgDir, "README.md"), "# Example");
  writeSetting("plugins", JSON.stringify(["@freestyle-voice/example-plugin"]));
});

afterAll(() => {
  writeSetting("plugins", "[]");
});

describe("GET /api/plugins", () => {
  it("returns discovered plugins without leaking the absolute dir", async () => {
    const res = await app.request("/api/plugins");
    expect(res.status).toBe(200);
    const { plugins } = (await res.json()) as {
      plugins: Array<Record<string, unknown>>;
    };
    const plugin = plugins.find((p) => p.slug === slug);
    expect(plugin).toBeDefined();
    expect(plugin).toMatchObject({
      name: "@freestyle-voice/example-plugin",
      slug,
      version: "1.2.3",
      displayName: "Example",
      enabled: true,
      readme: "# Example",
    });
    expect(plugin).not.toHaveProperty("dir");
    expect((plugin?.pages as unknown[]).length).toBe(1);
  });
});

describe("GET /api/plugins/:slug/ui/*", () => {
  it("serves an asset with its MIME type and a server-set CSP", async () => {
    const res = await app.request(`/api/plugins/${slug}/ui/dist/ui/index.html`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("content-security-policy")).toContain(
      "default-src 'self'",
    );
    expect(await res.text()).toContain("<title>hi</title>");
  });

  it("rejects path traversal outside the plugin dir", async () => {
    const res = await app.request(
      `/api/plugins/${slug}/ui/../../../../etc/passwd`,
    );
    expect(res.status).toBe(404);
  });

  it("404s for an unknown plugin slug", async () => {
    const res = await app.request("/api/plugins/nope/ui/index.html");
    expect(res.status).toBe(404);
  });
});
