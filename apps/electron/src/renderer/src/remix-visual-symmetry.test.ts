import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const rendererRoot = dirname(fileURLToPath(import.meta.url));

describe("Remix visual symmetry", () => {
  it("uses one readable column for chat and every Remix workspace view", async () => {
    const [panel, styles] = await Promise.all([
      readFile(resolve(rendererRoot, "components/panel.tsx"), "utf8"),
      readFile(resolve(rendererRoot, "remix-workspace.css"), "utf8"),
    ]);

    expect(panel).toContain("data-remix-view={tab}");
    expect(styles).toContain("--remix-reading-width: 760px;");
    expect(styles).toContain("padding: 24px var(--remix-content-gutter);");
    expect(styles).toContain(
      "width: min(var(--remix-reading-width), calc(100% - 40px));",
    );
    expect(styles).toContain('data-remix-view="apps"');
    expect(styles).toContain("width: min(100%, 1040px);");
  });

  it("keeps tasks, notes, Brain, and apps in the same quiet row language", async () => {
    const styles = await readFile(
      resolve(rendererRoot, "remix-workspace.css"),
      "utf8",
    );

    expect(styles).toContain("--remix-row-rule:");
    expect(styles).toMatch(
      /\.remix-agent \.tavern-todo\s*\{[^}]*var\(--remix-row-rule\)/s,
    );
    expect(styles).toMatch(
      /\.remix-agent \.tavern-note-row\s*\{[^}]*var\(--remix-row-rule\)/s,
    );
    expect(styles).toMatch(
      /\.remix-agent \.tavern-tree-row\s*\{[^}]*var\(--remix-row-rule\)/s,
    );
    expect(styles).toMatch(
      /\.remix-agent \.connector-group\s*\{[^}]*repeat\(3, minmax\(0, 1fr\)\)/s,
    );
    expect(styles).toMatch(
      /\.remix-agent \.connector-card\s*\{[^}]*min-height: 0;/s,
    );
  });

  it("does not reintroduce the light connector shimmer in dark Remix", async () => {
    const styles = await readFile(
      resolve(rendererRoot, "remix-workspace.css"),
      "utf8",
    );

    expect(styles).toContain(".remix-agent .connector-skeleton-mark,");
    expect(styles).toContain(
      "color-mix(in srgb, var(--muted-foreground) 20%, var(--secondary))",
    );
    expect(styles).not.toContain("#f8efd9");
  });
});
