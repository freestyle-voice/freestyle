import { createHash } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import * as tar from "tar";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  installPackage,
  type ResolvedPackage,
} from "../src/lib/plugins/installer.js";

let work: string;
let pluginsDir: string;

beforeEach(() => {
  work = fs.mkdtempSync(path.join(os.tmpdir(), "installer-test-"));
  pluginsDir = path.join(work, "plugins");
  fs.mkdirSync(pluginsDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(work, { recursive: true, force: true });
  vi.restoreAllMocks();
});

/** Build a gzipped npm-style tarball (files under `package/`) and return bytes. */
async function buildTarball(files: Record<string, string>): Promise<Buffer> {
  const src = path.join(work, "src", "package");
  for (const [rel, content] of Object.entries(files)) {
    const full = path.join(src, rel);
    await fsp.mkdir(path.dirname(full), { recursive: true });
    await fsp.writeFile(full, content);
  }
  const tgz = path.join(work, "pkg.tgz");
  await tar.c({ gzip: true, cwd: path.join(work, "src"), file: tgz }, [
    "package",
  ]);
  return fsp.readFile(tgz);
}

function mockFetchOnce(bytes: Buffer): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(bytes, { status: 200 })),
  );
}

describe("installPackage", () => {
  it("downloads, verifies, and extracts into <pluginsDir>/<slug> with package/ stripped", async () => {
    const bytes = await buildTarball({
      "package.json": JSON.stringify({
        name: "@freestyle/plugin-x",
        main: "index.js",
      }),
      "index.js": "export default () => ({ name: 'x' });",
    });
    mockFetchOnce(bytes);

    const integrity = `sha512-${createHash("sha512").update(bytes).digest("base64")}`;
    const resolved: ResolvedPackage = {
      name: "@freestyle/plugin-x",
      version: "1.0.0",
      tarball: "https://registry.npmjs.org/x/-/x-1.0.0.tgz",
      integrity,
    };

    const installed = await installPackage(pluginsDir, resolved);

    const dest = path.join(pluginsDir, "freestyle-plugin-x");
    expect(installed.dir).toBe(dest);
    expect(fs.existsSync(path.join(dest, "package.json"))).toBe(true);
    expect(fs.existsSync(path.join(dest, "index.js"))).toBe(true);
    // The `package/` wrapper must be stripped.
    expect(fs.existsSync(path.join(dest, "package"))).toBe(false);
  });

  it("rejects on an integrity mismatch", async () => {
    const bytes = await buildTarball({
      "package.json": JSON.stringify({ name: "@freestyle/plugin-x" }),
    });
    mockFetchOnce(bytes);

    const resolved: ResolvedPackage = {
      name: "@freestyle/plugin-x",
      version: "1.0.0",
      tarball: "https://registry.npmjs.org/x/-/x-1.0.0.tgz",
      integrity: "sha512-deadbeef",
    };

    await expect(installPackage(pluginsDir, resolved)).rejects.toThrow(
      /integrity mismatch/,
    );
    expect(fs.existsSync(path.join(pluginsDir, "freestyle-plugin-x"))).toBe(
      false,
    );
  });
});
