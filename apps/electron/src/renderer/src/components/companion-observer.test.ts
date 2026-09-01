import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const companionPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "companion.tsx",
);
const electronRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../..",
);
const preloadPath = join(electronRoot, "preload/index.ts");
const mainPath = join(electronRoot, "main/index.ts");

test("companion observes presentation events without dictation ownership", async () => {
  const source = await readFile(companionPath, "utf8");

  expect(source).toContain("window.api.onCompanionState");
  expect(source).toContain("companionOrientation()");
  expect(source).toContain("window.api.onCompanionOrientation");
  expect(source).toContain("facing={facing}");
  expect(source).toContain("window.api.openCompanionWorkspace()");
  expect(source).not.toContain("window.api.openSettings()");
  expect(source).toContain('aria-label="Drag to reposition companion"');
  expect(source).not.toMatch(
    /DictationController|useDictation|onHotkey(?:Down|Up)|onTalk(?:Down|Up)|onDictationCancel|dictationPrefs|onDictationPrefs|setDictationPhase|panelDictation|reconnectServer/,
  );
});

test("companion preload contract cannot navigate the application", async () => {
  const [preload, main] = await Promise.all([
    readFile(preloadPath, "utf8"),
    readFile(mainPath, "utf8"),
  ]);

  expect(preload).not.toContain("companionHover");
  expect(main).not.toContain('"companion:hover"');
});

test("companion exposes a local context menu without taking notification ownership", async () => {
  const [source, preload, main] = await Promise.all([
    readFile(companionPath, "utf8"),
    readFile(preloadPath, "utf8"),
    readFile(mainPath, "utf8"),
  ]);

  expect(source).toContain("window.api.companionContextMenu");
  expect(preload).toContain('ipcRenderer.send("companion:context-menu")');
  expect(main).toContain('ipcMain.on("companion:context-menu"');
  expect(main).not.toMatch(
    /CourierNotificationsProvider|useCourierNotifications|CourierSessionManager/,
  );
});

test("companion orientation is supplied by the display-owning main process", async () => {
  const [preload, main, stage] = await Promise.all([
    readFile(preloadPath, "utf8"),
    readFile(mainPath, "utf8"),
    readFile(join(dirname(companionPath), "../sprites/stage.tsx"), "utf8"),
  ]);

  expect(preload).toContain('ipcRenderer.invoke("companion:orientation")');
  expect(preload).toContain('ipcRenderer.on("companion:orientation"');
  expect(main).toContain('ipcMain.handle("companion:orientation"');
  expect(main).toContain("companionFacingForBounds");
  expect(main).toContain("publishCompanionFacing()");
  expect(stage).toContain("setDockFacing(facing)");
});

test("companion dock and hit area follow a mirrored sheet sprite", async () => {
  const source = await readFile(companionPath, "utf8");

  // SheetEngine mirrors only the canvas. The dock and its hover rectangle are
  // DOM geometry, so they need the same transform or the location control
  // becomes detached when a companion is parked on the right half of a screen.
  expect(source).toContain("function companionRectForFacing(");
  expect(source).toContain("const visualBody = useMemo(");
  expect(source).toContain("companionRectForFacing(");
  expect(source).toContain("<CompanionDock body={visualBody}");
});

test("companion dock is visually centered and uses its declared compact size", async () => {
  const source = await readFile(companionPath, "utf8");

  expect(source).toContain("const left = body.x + body.width / 2");
  expect(source).toContain('transform: "translateX(-50%)"');
  expect(source).toContain('boxSizing: "border-box"');
});

test("companion dock has a generous native drag target beyond its slim visual", async () => {
  const source = await readFile(companionPath, "utf8");

  expect(source).toContain("const COMPANION_DOCK_HIT_TARGET");
  expect(source).toContain("data-companion-dock-hit");
  expect(source).toContain('WebkitAppRegion: "drag"');
  expect(source).toContain('cursor: dragging ? "grabbing" : "grab"');
  expect(source).toContain('pointerEvents: "none"');
});

test("companion receives a compact Remix activity label separate from dictation state", async () => {
  const [source, preload, main] = await Promise.all([
    readFile(companionPath, "utf8"),
    readFile(preloadPath, "utf8"),
    readFile(mainPath, "utf8"),
  ]);

  expect(source).toContain("CompanionStatusPill");
  expect(source).toContain("Math.min(164, windowSize - 16)");
  expect(source).not.toContain(">\n        REMIX\n      </span>");
  expect(source).toContain('textOverflow: "ellipsis"');
  expect(source).toContain("companionStatus()");
  expect(source).toContain("window.api.onCompanionStatus");
  expect(preload).toContain('ipcRenderer.invoke("companion:status")');
  expect(preload).toContain('ipcRenderer.send("companion:set-status", status)');
  expect(main).toContain('ipcMain.handle("companion:status"');
  expect(main).toContain('ipcMain.on("companion:set-status"');
});
