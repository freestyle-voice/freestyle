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

    expect(shell).toContain('className="glass-content-titlebar"');
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
    expect(shell).toContain("{IS_MAC ? (");
    expect(shell).toContain('className="sidebar-reveal-trigger"');
    expect(shell).not.toContain("if (!IS_MAC) return null;");
  });
});
