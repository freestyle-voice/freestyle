import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sourceDir = dirname(fileURLToPath(import.meta.url));

describe("Remix foundation tokens", () => {
  it("uses the current shared palette outside Remix workspace inheritance", async () => {
    const styles = await readFile(
      resolve(sourceDir, "remix-foundation.css"),
      "utf8",
    );
    const root = styles.slice(
      styles.indexOf(":root {"),
      styles.indexOf(".tavern {"),
    );

    expect(root).toContain("--remix-accent: var(--primary)");
    expect(root).toContain("--remix-text: var(--foreground)");
    expect(root).toContain("--tavern-lantern: var(--remix-accent)");
    expect(root).toContain("--tavern-ink: var(--remix-text)");
    expect(root).not.toContain("#d98e2b");
    expect(styles).not.toContain("background: #c47f24");
  });
});
