import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const component = readFileSync(
  new URL("./mobile-connect-suggestions.tsx", import.meta.url),
  "utf8",
);

describe("mobile connector suggestion layout", () => {
  it("uses a compact grouped list rather than large explanatory cards", () => {
    expect(component).toContain("styles.suggestionRow");
    expect(component).toContain("numberOfLines={1}");
    expect(component).toContain("<Plus color={theme.primary} size={18} />");
    expect(component).not.toContain("styles.card");
  });

  it("renders connected apps as an inert confirmation rather than another connect action", () => {
    expect(component).toContain("connectedSlugs.has(suggestion.slug)");
    expect(component).toContain("<Check color={theme.primary} size={18} />");
    expect(component).toContain("is connected");
  });
});
