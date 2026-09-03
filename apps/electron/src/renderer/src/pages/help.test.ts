import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const helpPagePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "help.tsx",
);

describe("HelpPage", () => {
  it("makes the GitHub repository a first-class resource", async () => {
    const page = await readFile(helpPagePath, "utf8");

    expect(page).toContain("href={LINKS.repo}");
    expect(page).toContain("SiGithub");
    expect(page).toContain("View the source, releases, and open work.");
  });

  it("keeps contribution guidance compact", async () => {
    const page = await readFile(helpPagePath, "utf8");

    expect(page).toContain('className="help-contribute-callout ');
    expect(page).toContain("Read the contributing guide");
  });
});
