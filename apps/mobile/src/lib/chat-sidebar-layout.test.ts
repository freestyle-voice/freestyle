import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sidebar = readFileSync(
  new URL("../components/chat-sidebar.tsx", import.meta.url),
  "utf8",
);

describe("chat sidebar layout", () => {
  it("keeps top and bottom safe-area clearance and exposes one account entry", () => {
    expect(sidebar).toMatch(/edges=\{\["top", "bottom", "left"\]\}/);
    expect(sidebar).toMatch(/<AccountButton[\s\S]*?\/>/);
    expect(sidebar).not.toMatch(/navigate\("\/\(app\)\/settings"\)/);
  });
});
