import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const screen = readFileSync(
  new URL("../app/(app)/profile.tsx", import.meta.url),
  "utf8",
);

describe("Profile settings layout", () => {
  it("uses a compact account editor instead of an always-open name form", () => {
    expect(screen).toContain("NameEditorSheet");
    expect(screen).toContain('accessibilityLabel="Edit name"');
    expect(screen).not.toContain("function NameCard");
  });

  it("removes the redundant Freestyle group label and keeps work details collapsed", () => {
    expect(screen).not.toContain('<SettingsGroup title="Freestyle">');
    expect(screen).toContain('<SettingsGroup title="Personalization">');
    expect(screen).toContain('label="Work profile"');
  });

  it("only exposes a workspace switcher when the person has a choice", () => {
    expect(screen).toContain("enabled: hasMultiple");
    expect(screen).toContain(
      "if (orgsLoading || activeLoading || !hasMultiple) return null;",
    );
  });
});
