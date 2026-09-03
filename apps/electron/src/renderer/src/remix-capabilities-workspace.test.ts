import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const rendererRoot = dirname(fileURLToPath(import.meta.url));

describe("Remix capabilities workspace", () => {
  it("uses a first-class workspace surface instead of an empty-chat subview", async () => {
    const [sessions, panel, styles] = await Promise.all([
      readFile(
        resolve(rendererRoot, "components/remix-session-context.tsx"),
        "utf8",
      ),
      readFile(resolve(rendererRoot, "components/panel.tsx"), "utf8"),
      readFile(resolve(rendererRoot, "remix-workspace.css"), "utf8"),
    ]);

    expect(sessions).toContain('"capabilities"');
    expect(sessions).toContain("openCapabilities");
    expect(panel).toContain("RemixCapabilitiesHeader");
    expect(panel).toContain('desktopSurface === "capabilities"');
    expect(panel).toContain('className="tavern-capabilities-page"');
    expect(panel).toContain("onShowAll={onOpenCapabilities}");
    expect(panel).not.toContain('className="tavern-file-back"');
    expect(styles).toContain(".remix-agent .tavern-capabilities-page");
  });
});
