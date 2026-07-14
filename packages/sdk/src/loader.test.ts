import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveLocalPackage } from "./loader.js";
import { pluginSlug } from "./ui.js";

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "sdk-loader-"));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function writePackage(slug: string, pkg: Record<string, unknown>): string {
  const pkgDir = path.join(dir, slug);
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.writeFileSync(path.join(pkgDir, "package.json"), JSON.stringify(pkg));
  return pkgDir;
}

describe("resolveLocalPackage", () => {
  it("resolves a scoped specifier to its slug folder + main entry", () => {
    const pkgDir = writePackage(pluginSlug("@freestyle-voice/plugin-x"), {
      name: "@freestyle-voice/plugin-x",
      main: "dist/index.js",
    });
    fs.mkdirSync(path.join(pkgDir, "dist"));
    fs.writeFileSync(
      path.join(pkgDir, "dist", "index.js"),
      "export default 1;",
    );

    expect(resolveLocalPackage(dir, "@freestyle-voice/plugin-x")).toBe(
      path.join(pkgDir, "dist", "index.js"),
    );
  });

  it("defaults main to index.js", () => {
    const pkgDir = writePackage(pluginSlug("plugin-y"), { name: "plugin-y" });
    fs.writeFileSync(path.join(pkgDir, "index.js"), "export default 1;");

    expect(resolveLocalPackage(dir, "plugin-y")).toBe(
      path.join(pkgDir, "index.js"),
    );
  });

  it("returns null when the folder or entry is missing", () => {
    expect(resolveLocalPackage(dir, "@freestyle-voice/absent")).toBeNull();

    // Folder + manifest exist, but the main file doesn't.
    writePackage(pluginSlug("plugin-z"), {
      name: "plugin-z",
      main: "dist/index.js",
    });
    expect(resolveLocalPackage(dir, "plugin-z")).toBeNull();
  });
});
