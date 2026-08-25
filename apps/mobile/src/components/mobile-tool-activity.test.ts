import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const component = readFileSync(
  new URL("./mobile-tool-activity.tsx", import.meta.url),
  "utf8",
);

describe("mobile tool activity UI", () => {
  it("uses a quiet inline execution trace without dumping connected-app results", () => {
    expect(component).toContain("mobileToolActivity(parts)");
    expect(component).toContain('themeColor="mutedForeground"');
    expect(component).not.toContain('type="eyebrow"');
    expect(component).not.toContain("borderLeftWidth");
    expect(component).not.toContain("JSON.stringify");
  });
});
