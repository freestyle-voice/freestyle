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
