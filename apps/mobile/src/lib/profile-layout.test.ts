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

  it("shows work details as direct value rows instead of a collapsed legacy form", () => {
    expect(screen).not.toContain('<SettingsGroup title="Freestyle">');
    expect(screen).not.toContain('<SettingsGroup title="Personalization">');
    expect(screen).toContain('<SettingsGroup title="Work profile">');
    expect(screen).toContain('label="Industry"');
    expect(screen).toContain('label="Job title"');
    expect(screen).toContain('label="Company"');
    expect(screen).toContain("TextEditorSheet");
    expect(screen).toContain('presentationStyle="formSheet"');
  });

  it("only exposes a workspace switcher when the person has a choice", () => {
    expect(screen).toContain("enabled: hasMultiple");
    expect(screen).toContain(
      "if (orgsLoading || activeLoading || !hasMultiple) return null;",
    );
    expect(screen).toContain("ActionSheetIOS.showActionSheetWithOptions");
  });
});
