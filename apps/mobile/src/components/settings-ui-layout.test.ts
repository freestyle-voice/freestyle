import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./settings-ui.tsx", import.meta.url),
  "utf8",
);

describe("settings row layout", () => {
  it("keeps row labels, summaries, and switch hints to one controlled line", () => {
    expect(source).toMatch(
      /style=\{styles\.navRowLabel\}\s+numberOfLines=\{1\}/,
    );
    expect(source).toMatch(
      /style=\{styles\.navRowValue\}\s+numberOfLines=\{1\}/,
    );
    expect(source).toMatch(
      /style=\{styles\.toggleHint\}\s+numberOfLines=\{1\}/,
    );
    expect(source).toContain('maxWidth: "38%"');
    expect(source).toMatch(/valueRowLabel:\s*\{\s*flex: 1,\s*minWidth: 0/);
  });
});
