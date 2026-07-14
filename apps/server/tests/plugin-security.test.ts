import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pluginSlug } from "freestyle-voice";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import createApp from "../src/index.js";
import { writeSetting } from "../src/lib/db.js";

const app = createApp();

const PLUGIN_NAME = "@freestyle-voice/secure-plugin";
const slug = pluginSlug(PLUGIN_NAME);
const OTHER_NAME = "@freestyle-voice/other-plugin";

/** A `Referer` that looks like it came from this plugin's own UI page. */
function refererFor(pluginSlugValue: string): string {
  return `http://127.0.0.1:4649/api/plugins/${pluginSlugValue}/ui/index.html`;
}

let pluginsDir: string;

beforeAll(() => {
  pluginsDir = path.join(
    path.dirname(process.env.FREESTYLE_DB_PATH as string),
    "plugins",
  );
  const pkgDir = path.join(pluginsDir, slug);
  mkdirSync(path.join(pkgDir, "dist", "ui"), { recursive: true });
  writeFileSync(
    path.join(pkgDir, "package.json"),
    JSON.stringify({ name: PLUGIN_NAME, version: "1.0.0" }),
  );
  writeFileSync(
    path.join(pkgDir, "dist", "ui", "index.html"),
    "<!doctype html><title>secure</title>",
  );

  // A symlink inside the plugin dir pointing outside it (attacker-planted).
  try {
    symlinkSync("/etc", path.join(pkgDir, "dist", "ui", "escape"));
  } catch {
    // Some CI filesystems disallow symlinks; the symlink test skips itself.
  }

  writeSetting("plugins", JSON.stringify([PLUGIN_NAME]));
});

afterAll(() => {
  writeSetting("plugins", "[]");
});

// The storage route's `:name` is the plugin's *package name* (so a page shares
// state with its `setup()` hooks, which key on `plugin:<name>:<key>`). It is
// URL-encoded to survive the `@`/`/` in scoped names. Authorization compares the
// caller's `Referer` slug against `pluginSlug(:name)`.
const OWN = encodeURIComponent(PLUGIN_NAME);
const OTHER = encodeURIComponent(OTHER_NAME);

describe("plugin storage authorization", () => {
  it("lets a plugin page access its own storage namespace", async () => {
    const put = await app.request(`/api/plugins/${OWN}/storage/pref`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        referer: refererFor(slug),
        origin: "app://.",
      },
      body: JSON.stringify({ value: { on: true } }),
    });
    expect(put.status).toBe(200);

    const get = await app.request(`/api/plugins/${OWN}/storage/pref`, {
      headers: { referer: refererFor(slug) },
    });
    expect(get.status).toBe(200);
    expect(await get.json()).toEqual({ value: { on: true } });
  });

  it("blocks a plugin page from reading another plugin's storage", async () => {
    const res = await app.request(`/api/plugins/${OTHER}/storage/secret`, {
      headers: { referer: refererFor(slug) },
    });
    expect(res.status).toBe(403);
  });

  it("blocks a plugin page from writing another plugin's storage", async () => {
    const res = await app.request(`/api/plugins/${OTHER}/storage/secret`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        referer: refererFor(slug),
        origin: "app://.",
      },
      body: JSON.stringify({ value: "pwned" }),
    });
    expect(res.status).toBe(403);
  });

  it("rejects a malformed storage key", async () => {
    const res = await app.request(
      `/api/plugins/${OWN}/storage/${encodeURIComponent("bad:key")}`,
      { headers: { referer: refererFor(slug) } },
    );
    expect(res.status).toBe(400);
  });

  it("rejects an over-large stored value", async () => {
    const big = "x".repeat(300 * 1024);
    const res = await app.request(`/api/plugins/${OWN}/storage/blob`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        referer: refererFor(slug),
        origin: "app://.",
      },
      body: JSON.stringify({ value: big }),
    });
    expect(res.status).toBe(413);
  });

  it("still allows the first-party renderer (no plugin referer)", async () => {
    const res = await app.request(`/api/plugins/${OTHER}/storage/anything`, {
      headers: { origin: "app://." },
    });
    expect(res.status).toBe(200);
  });
});

describe("plugin API guard", () => {
  it("denies a plugin page reaching the privileged first-party API", async () => {
    const res = await app.request("/api/keys", {
      headers: { referer: refererFor(slug) },
    });
    expect(res.status).toBe(403);
  });

  it("allows a plugin page to reach /api/health", async () => {
    const res = await app.request("/api/health", {
      headers: { referer: refererFor(slug) },
    });
    expect(res.status).toBe(200);
  });

  it("does not affect the first-party renderer", async () => {
    const res = await app.request("/api/health");
    expect(res.status).toBe(200);
  });
});

describe("plugin asset symlink escape", () => {
  it("does not serve a file reached through a symlink out of the plugin dir", async () => {
    const res = await app.request(
      `/api/plugins/${slug}/ui/dist/ui/escape/passwd`,
    );
    // Either the symlink couldn't be created (404 for missing file) or the
    // realpath guard rejected it (404) — never a 200 serving /etc/passwd.
    expect(res.status).toBe(404);
  });
});
