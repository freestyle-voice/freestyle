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

  it("registers the local pill-position IPC contract once at startup", async () => {
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
    expect([
      ...main.matchAll(/ipcMain\.handle\("settings:pill-position"/g),
    ]).toHaveLength(1);
    expect([
      ...main.matchAll(/ipcMain\.on\("settings:set-pill-position"/g),
    ]).toHaveLength(1);

    const startup = main.slice(
      main.indexOf("app.whenReady().then(async () => {"),
      main.indexOf("registerSummonShortcut();"),
    );
    expect(startup.indexOf("registerPillPositionIpc();")).toBeLessThan(
      startup.indexOf("createPillWindow();"),
    );

    const showPill = main.slice(
      main.indexOf("function showPill(): void {"),
      main.indexOf("function openPanelSettings(): void {"),
    );
    expect(showPill).not.toContain('ipcMain.handle("settings:pill-position"');
    expect(showPill).not.toContain('ipcMain.on("settings:set-pill-position"');
  });

  it("routes the Remix hold hotkey through the pill's live event contract", async () => {
    const [main, preload, pill] = await Promise.all([
      readFile(mainPath, "utf8"),
      readFile(preloadPath, "utf8"),
      readFile(join(rendererRoot, "pages/app.tsx"), "utf8"),
    ]);

    const handlers = main.slice(
      main.indexOf("function handleRemixHotkeyDown(): void {"),
      main.indexOf("async function registerRemixHotkey"),
    );

    expect(handlers).toContain('webContents.send("remix:down")');
    expect(handlers).toContain('webContents.send("remix:up")');
    expect(handlers).toContain("captureRemixSelection()");
    expect(handlers).not.toContain('webContents.send("talk:down")');
    expect(handlers).not.toContain('webContents.send("talk:up")');
    expect(preload).toContain('ipcRenderer.on("remix:down"');
    expect(preload).toContain('ipcRenderer.on("remix:up"');
    expect(pill).toContain("window.api.onRemixDown(beginRemix)");
    expect(pill).toContain("window.api.onRemixUp(finishRemixPress)");
  });

  it("resets stale expanded bounds before placing either hotkey pill", async () => {
    const main = await readFile(mainPath, "utf8");
    const showPill = main.slice(
      main.indexOf("function showPill(): void {"),
      main.indexOf("function openPanelSettings(): void {"),
    );

    expect(showPill.indexOf("setPillExpanded(false);")).toBeGreaterThan(-1);
    expect(showPill.indexOf("setPillExpanded(false);")).toBeLessThan(
      showPill.indexOf("movePillToDisplaySlot("),
    );
    expect(main).toContain("function anchorPillForHotkey(): void {");
    expect(main).not.toContain("function anchorPillForDictation(): void {");
  });

  it("opens a pill conversation in the existing workspace window", async () => {
    const [main, preload] = await Promise.all([
      readFile(mainPath, "utf8"),
      readFile(preloadPath, "utf8"),
    ]);
    const workspace = main.slice(
      main.indexOf('ipcMain.on("remix:open-workspace"'),
      main.indexOf('ipcMain.on("settings:close"'),
    );

    expect(preload).toContain(
      "openRemixWorkspace: (threadId: string): void =>",
    );
    expect(workspace).toContain("openPanel({ focusComposer: true");
    expect(workspace).toContain('channel: "panel:open-thread"');
    expect(workspace).not.toContain("openRemixWorkspaceWindow()");
    expect(main).not.toContain("function openRemixWorkspaceWindow(): void {");
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

  it("allows the local companion to open the restored Settings window", async () => {
    const main = await readFile(mainPath, "utf8");
    const settingsOpenHandler = main.slice(
      main.indexOf('ipcMain.on("settings:open"'),
      main.indexOf('ipcMain.on("settings:close"'),
    );

    expect(settingsOpenHandler).toContain("companionWindow?.webContents");
    expect(settingsOpenHandler).toContain("openSettingsWindow()");
  });
});
