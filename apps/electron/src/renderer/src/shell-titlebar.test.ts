import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourceDir = dirname(fileURLToPath(import.meta.url));

describe("desktop content titlebar", () => {
  it("restores one thin global drag strip without reintroducing old actions", async () => {
    const [shell, spacer, styles] = await Promise.all([
      readFile(resolve(sourceDir, "shell.tsx"), "utf8"),
      readFile(resolve(sourceDir, "components/drag-spacer.tsx"), "utf8"),
      readFile(resolve(sourceDir, "shell.css"), "utf8"),
    ]);

    expect(shell).toContain('"glass-content-titlebar",');
    expect(shell).toContain('WebkitAppRegion: "drag"');
    expect(shell).not.toContain('className="glass-topbar');
    expect(spacer).toContain("h-7");
    expect(spacer).not.toContain('WebkitAppRegion: "drag"');
    expect(styles).toContain("position: absolute");
    expect(styles).toContain("height: 8px");
    expect(styles).not.toContain("flex: 0 0 24px");
  });

  it("reserves custom chrome only for macOS", async () => {
    const shell = await readFile(resolve(sourceDir, "shell.tsx"), "utf8");

    expect(shell).toContain(
      'import { IS_MAC, MOD_LABEL } from "@renderer/lib/platform"',
    );
    expect(shell).toContain('IS_MAC && !isFullscreen ? "h-8" : "h-0"');
    expect(shell).toContain("if (!IS_MAC) return null;");
    expect(shell).toContain('label="Show sidebar"');
    expect(shell).toContain(
      'className="glass-sidebar glass-sidebar--collapsed"',
    );
    expect(shell).toContain(
      'IS_MAC && !isFullscreen && "sidebar-rail-chrome--mac"',
    );
    expect(shell).not.toContain('className="sidebar-reveal-trigger"');
  });
  it("reserves native control space above both collapsed panes and keeps the rail fixed at narrow widths", async () => {
    const styles = await readFile(resolve(sourceDir, "shell.css"), "utf8");
    expect(styles).toContain("flex: 0 0 56px;");
    expect(styles).toContain(
      ".sidebar-rail-chrome--mac {\n  flex-basis: 44px;",
    );
    expect(styles).toContain("flex: 0 0 44px;");
    expect(styles).toContain(".sidebar-rail-navigation");
    expect(styles).toContain("overflow-y: auto;");
    expect(styles).toContain(".sidebar-rail-button:focus-visible");
  });
});
