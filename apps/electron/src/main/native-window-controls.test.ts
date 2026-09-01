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
  it("uses Electron's native chrome for the workspace window", async () => {
    const source = await readFile(mainPath, "utf8");
    const panel = sourceForFunction(source, "createPanelWindow");

    expect(panel).toContain(
      'titleBarStyle: process.platform === "darwin" ? "hidden" : "default"',
    );
    expect(panel).toContain("trafficLightPosition:");
    expect(panel).not.toContain("frame: false");
  });

  it("opens Settings inside the existing workspace instead of creating a second window", async () => {
    const source = await readFile(mainPath, "utf8");
    const settings = sourceForFunction(source, "openPanelSettings");

    expect(settings).toContain('openPanel({ trigger: "other" })');
    expect(settings).toContain("win.focus()");
    expect(settings).toContain('channel: "dashboard:navigate"');
    expect(settings).toContain('payload: "/settings"');
    expect(settings).not.toContain("new BrowserWindow");
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
