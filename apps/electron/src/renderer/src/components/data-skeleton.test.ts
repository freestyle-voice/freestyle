import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DataSkeleton } from "./data-skeleton";

const stylesPath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "data-skeleton.css",
);

describe("DataSkeleton", () => {
  it("exposes an accessible busy label and reserves multiple rows", () => {
    const html = renderToStaticMarkup(
      createElement(DataSkeleton, { label: "Loading conversations" }),
    );
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-label="Loading conversations"');
    expect(html.match(/tavern-data-skeleton-row/g)).toHaveLength(3);
  });

  it("uses the active app theme rather than Tavern's retired palette", async () => {
    const styles = await readFile(stylesPath, "utf8");

    expect(styles).toContain("--data-skeleton-card: var(--card)");
    expect(styles).toContain("--data-skeleton-surface: var(--secondary)");
    expect(styles).toContain("--data-skeleton-muted: var(--muted-foreground)");
    expect(styles).not.toContain("var(--tavern-");
  });

  it("uses the matching visual structure for workspace content", () => {
    const tasks = renderToStaticMarkup(
      createElement(DataSkeleton, { label: "Loading todos", variant: "tasks" }),
    );
    const notes = renderToStaticMarkup(
      createElement(DataSkeleton, { label: "Loading notes", variant: "notes" }),
    );
    const files = renderToStaticMarkup(
      createElement(DataSkeleton, { label: "Loading files", variant: "files" }),
    );

    expect(tasks).toContain("is-tasks");
    expect(tasks).toContain("tavern-data-skeleton-check");
    expect(notes).toContain("is-notes");
    expect(files).toContain("is-files");
    expect(files).toContain("tavern-data-skeleton-file-mark");
  });
});
