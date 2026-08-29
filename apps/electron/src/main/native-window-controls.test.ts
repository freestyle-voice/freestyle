import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const mainPath = resolve(dirname(fileURLToPath(import.meta.url)), "index.ts");
const shellPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../renderer/src/shell.tsx",
);

function sourceForFunction(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`);
  const nextFunction = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, nextFunction === -1 ? undefined : nextFunction);
}

describe("native desktop window controls", () => {
  it("uses Electron's native chrome for the workspace and settings windows", async () => {
    const source = await readFile(mainPath, "utf8");
    const panel = sourceForFunction(source, "createPanelWindow");
    const settings = sourceForFunction(source, "openSettingsWindow");

    for (const windowSource of [panel, settings]) {
      expect(windowSource).toContain(
        'titleBarStyle: process.platform === "darwin" ? "hidden" : "default"',
      );
      expect(windowSource).toContain("trafficLightPosition:");
      expect(windowSource).not.toContain("frame: false");
    }
  });

  it("does not render imitation traffic-light buttons", async () => {
    const shell = await readFile(shellPath, "utf8");
    expect(shell).not.toContain("function WindowControls");
    expect(shell).not.toContain("window.api?.windowControl");
  });

  it("publishes native fullscreen changes for the sidebar layout", async () => {
    const source = await readFile(mainPath, "utf8");

    expect(source).toContain('win.on("enter-full-screen", send(true))');
    expect(source).toContain('win.on("leave-full-screen", send(false))');
    expect(source).toContain(
      'webContents.send("fullscreen:changed", fullscreen)',
    );
  });
});
