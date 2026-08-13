import { describe, expect, it } from "vitest";
import { highlightToolJson } from "./tool-json";

describe("highlightToolJson", () => {
  it("returns Shiki-highlighted and escaped JSON", async () => {
    const html = await highlightToolJson(
      JSON.stringify({ query: "<script>", unread: true }, null, 1),
    );

    expect(html).toContain('class="shiki');
    expect(html).toContain("<span");
    expect(html).toContain("&#x3C;script>");
    expect(html).not.toContain("<script>");
  });
});
