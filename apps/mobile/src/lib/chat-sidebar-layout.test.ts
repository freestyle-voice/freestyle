import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const sidebar = readFileSync(
  new URL("../components/chat-sidebar.tsx", import.meta.url),
  "utf8",
);

describe("chat sidebar layout", () => {
  it("keeps the drawer focused on sessions and clear of device edges", () => {
    expect(sidebar).toMatch(/paddingTop: Math\.max\(insets\.top/);
    expect(sidebar).toMatch(/paddingBottom:\s*\n?\s*Math\.max\(insets\.bottom/);
    expect(sidebar).toMatch(/mode === "dictate"/);
    expect(sidebar).toMatch(/RECENT DICTATIONS/);
    expect(sidebar).toMatch(/RECENT CHATS/);
    expect(sidebar).not.toMatch(/Freestyle/);
    expect(sidebar).not.toMatch(/Close sessions/);
    expect(sidebar).not.toMatch(/Open account and settings/);
    expect(sidebar).not.toMatch(/Dictation history/);
    expect(sidebar).not.toMatch(/AccountButton/);
  });

  it("curves the drawer's exposed edge to match the sliding chat canvas", () => {
    expect(sidebar).toMatch(/borderTopRightRadius: 38/);
    expect(sidebar).toMatch(/borderBottomRightRadius: 38/);
    expect(sidebar).toMatch(/overflow: "hidden"/);
  });
});
