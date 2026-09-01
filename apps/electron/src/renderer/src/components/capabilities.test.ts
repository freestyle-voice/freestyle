import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const componentDir = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(componentDir, "capabilities.tsx");
const stylesPath = resolve(componentDir, "../tavern.css");

describe("Capabilities", () => {
  it("presents suggestions as a responsive action-card gallery", async () => {
    const [source, styles] = await Promise.all([
      readFile(sourcePath, "utf8"),
      readFile(stylesPath, "utf8"),
    ]);

    expect(source).toContain('className="tavern-cap-grid"');
    expect(source).toContain("CapabilityGlyph");
    expect(source).toContain('className="tavern-cap-action"');
    expect(source).toContain("CapabilitiesLoadingSkeleton");
    expect(source).not.toContain('className="tavern-empty">Loading…');
    expect(styles).toContain(".tavern-cap-skeleton");
    expect(styles).toContain(".tavern-cap-grid");
    expect(styles).toContain("grid-template-columns: repeat(auto-fit");
    expect(styles).toContain("var(--secondary) 84%, var(--card)");
    expect(styles).not.toContain("var(--tavern-wash) 84%, var(--tavern-card)");
  });
});
