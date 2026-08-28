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
