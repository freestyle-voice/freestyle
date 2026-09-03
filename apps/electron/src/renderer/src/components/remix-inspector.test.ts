import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const componentDir = dirname(fileURLToPath(import.meta.url));

describe("Remix inspector", () => {
  it("keeps detailed context in persistent, resizable workspace tabs", async () => {
    const [inspector, styles] = await Promise.all([
      readFile(resolve(componentDir, "remix-inspector.tsx"), "utf8"),
      readFile(resolve(componentDir, "../remix-workspace.css"), "utf8"),
    ]);

    expect(inspector).toContain('"remix.inspectorWidth"');
    expect(inspector).toContain('role="separator"');
    expect(inspector).toContain('aria-label="Resize inspector"');
    expect(inspector).toContain("onOpenFile");
    expect(inspector).toContain("data-remix-inspector-tab");
    expect(inspector).toContain('className="remix-inspector-editor"');
    expect(inspector).toContain("BreadcrumbPage");
    expect(inspector).toContain("BreadcrumbSeparator");
    expect(inspector).toContain("remix-inspector-document-location");
    expect(inspector).toContain("Edited");
    expect(inspector).toContain('aria-label="Revert changes"');
    expect(inspector).toContain(
      'className="remix-inspector-document-action-group"',
    );
    expect(inspector).toContain("Saved");
    expect(inspector).not.toContain("closeTab");
    expect(styles).toContain(".remix-inspector");
    expect(styles).toContain(".remix-inspector-resize-handle");
    expect(styles).toContain("position: relative;");
    expect(styles).not.toContain(
      '.remix-inspector-tab-wrap:has(button[aria-selected="true"])',
    );
    expect(styles).not.toContain(".remix-inspector-close");
    expect(styles).toContain("@media (max-width: 760px)");
  });
});
