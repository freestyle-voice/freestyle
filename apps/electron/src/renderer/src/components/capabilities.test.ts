import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const componentDir = dirname(fileURLToPath(import.meta.url));
const sourcePath = resolve(componentDir, "capabilities.tsx");
const stylesPath = resolve(componentDir, "../remix-foundation.css");

import { capabilityActionLabel } from "../lib/capability-action";

describe("Capabilities", () => {
  it("distinguishes starting a chat, adding an automation, and connecting an app", () => {
    expect(capabilityActionLabel({ prompt: "Draft a reply" })).toBe(
      "Start chat",
    );
    expect(capabilityActionLabel({ templateId: "daily-brief" })).toBe(
      "Add automation",
    );
    expect(capabilityActionLabel({ locked: true, toolkitSlug: "gmail" })).toBe(
      "Connect app",
    );
    expect(
      capabilityActionLabel({ templateId: "daily-brief" }, "pending"),
    ).toBe("Adding…");
    expect(
      capabilityActionLabel({ templateId: "daily-brief" }, "applied"),
    ).toBe("Added");
    expect(capabilityActionLabel({ templateId: "daily-brief" }, "failed")).toBe(
      "Retry setup",
    );
  });
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
