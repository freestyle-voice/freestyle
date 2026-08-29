import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const electronRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const mainRoot = join(electronRoot, "src/main");
const rendererRoot = join(electronRoot, "src/renderer/src");
const preloadPath = join(electronRoot, "src/preload/index.ts");
const mainPath = join(electronRoot, "src/main/index.ts");

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

  it("registers the local pill-position IPC contract used at startup", async () => {
    const [preload, main] = await Promise.all([
      readFile(preloadPath, "utf8"),
      readFile(mainPath, "utf8"),
    ]);

    expect(preload).toContain('ipcRenderer.invoke("settings:pill-position")');
    expect(preload).toContain(
      'ipcRenderer.send("settings:set-pill-position", position)',
    );
    expect(main).toContain('ipcMain.handle("settings:pill-position"');
    expect(main).toContain('ipcMain.on("settings:set-pill-position"');
  });

  it("registers every preload invoke channel in the main process", async () => {
    const [preload, mainSources] = await Promise.all([
      readFile(preloadPath, "utf8"),
      Promise.all(
        (await sourceFiles(mainRoot)).map((path) => readFile(path, "utf8")),
      ),
    ]);
    const invoked = new Set(
      [...preload.matchAll(/ipcRenderer\.invoke\(\s*["']([^"']+)["']/g)].map(
        (match) => match[1],
      ),
    );
    const handled = new Set(
      [
        ...mainSources
          .join("\n")
          .matchAll(/ipcMain\.handle\(\s*["']([^"']+)["']/g),
      ].map((match) => match[1]),
    );

    expect([...invoked].filter((channel) => !handled.has(channel))).toEqual([]);
  });
});
