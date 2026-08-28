import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const electronRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const rendererRoot = join(electronRoot, "src/renderer/src");
const preloadPath = join(electronRoot, "src/preload/index.ts");

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return [path];
    }),
  );
  return nested
    .flat()
    .filter((path) => [".ts", ".tsx"].includes(extname(path)));
}

describe("preload contract", () => {
  it("exposes every renderer API method that the desktop surfaces use", async () => {
    const preload = await readFile(preloadPath, "utf8");
    const exposed = new Set(
      [...preload.matchAll(/^ {2}([A-Za-z_$][\w$]*):/gm)].map(
        (match) => match[1],
      ),
    );
    const methods = new Set<string>();
    const unsafeOptionalCalls: string[] = [];

    for (const path of await sourceFiles(rendererRoot)) {
      const source = await readFile(path, "utf8");
      for (const match of source.matchAll(
        /window\.api(?:\?\.)?\.([A-Za-z_$][\w$]*)/g,
      )) {
        methods.add(match[1]);
      }
      for (const match of source.matchAll(
        /window\.api\?\.([A-Za-z_$][\w$]*)\(/g,
      )) {
        unsafeOptionalCalls.push(`${path}:${match[1]}`);
      }
    }

    expect([...methods].filter((method) => !exposed.has(method))).toEqual([]);
    expect(unsafeOptionalCalls).toEqual([]);
  });
});
