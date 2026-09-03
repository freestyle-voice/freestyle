import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const rendererRoot = dirname(fileURLToPath(import.meta.url));

describe("Remix new-chat state", () => {
  it("uses a focused welcome and a compact suggestion area", async () => {
    const openers = await readFile(
      resolve(rendererRoot, "components/opener-cards.tsx"),
      "utf8",
    );
    const styles = await readFile(
      resolve(rendererRoot, "remix-workspace.css"),
      "utf8",
    );

    expect(openers).toContain("Where should we start?");
    expect(openers).toContain('className="tavern-opener-suggestions"');
    expect(styles).toContain(".remix-agent .tavern-opener-suggestions");
    expect(styles).toContain(
      "grid-template-columns: repeat(2, minmax(0, 1fr))",
    );
  });
});
