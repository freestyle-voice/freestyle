import { constants } from "node:fs";
import { access, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const electronRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

async function exists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

describe("desktop companion removal", () => {
  it("ships no companion renderer, settings route, or preload bridge", async () => {
    const [vite, preload, settings, shell, dashboard] = await Promise.all([
      readFile(join(electronRoot, "electron.vite.config.ts"), "utf8"),
      readFile(join(electronRoot, "src/preload/index.ts"), "utf8"),
      readFile(
        join(electronRoot, "src/renderer/src/pages/settings.tsx"),
        "utf8",
      ),
      readFile(join(electronRoot, "src/renderer/src/shell.tsx"), "utf8"),
      readFile(join(electronRoot, "src/renderer/src/dashboard.tsx"), "utf8"),
    ]);

    expect(
      await exists(join(electronRoot, "src/renderer/companion.html")),
    ).toBe(false);
    expect(
      await exists(
        join(electronRoot, "src/renderer/src/components/companion.tsx"),
      ),
    ).toBe(false);
    expect(vite).not.toContain(
      'companion: resolve("src/renderer/companion.html")',
    );
    expect(preload).not.toContain('"companion:');
    expect(preload).not.toContain('"pet:');
    expect(settings).not.toContain('activeSection === "companion"');
    expect(shell).not.toContain('to: "/settings/companion"');
    expect(dashboard).not.toContain("companion: {");
  });
});
