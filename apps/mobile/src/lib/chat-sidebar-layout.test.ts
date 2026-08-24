import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sidebar = readFileSync(
  new URL("../components/chat-sidebar.tsx", import.meta.url),
  "utf8",
);

describe("chat sidebar layout", () => {
  it("keeps the drawer clear of device edges and exposes a compact action row", () => {
    expect(sidebar).toMatch(/paddingTop: Math\.max\(insets\.top/);
    expect(sidebar).toMatch(/paddingBottom:\s*\n?\s*Math\.max\(insets\.bottom/);
    expect(sidebar).toMatch(/mode === "dictate"/);
    expect(sidebar).toMatch(/RECENT DICTATIONS/);
    expect(sidebar).toMatch(/RECENT CHATS/);
    expect(sidebar).toMatch(/accessibilityLabel="Open account and settings"/);
    expect(sidebar).not.toMatch(/Dictation history/);
    expect(sidebar).not.toMatch(/AccountButton/);
  });
});
