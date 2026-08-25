import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const screen = readFileSync(
  new URL("../app/(app)/profile.tsx", import.meta.url),
  "utf8",
);

describe("Profile settings layout", () => {
  it("uses a compact account editor instead of an always-open name form", () => {
    expect(screen).toContain("NameEditorSheet");
    expect(screen).toContain('label="Name"');
    expect(screen).not.toContain('accessibilityLabel="Edit name"');
    expect(screen).not.toContain("nameEditBadge");
    expect(screen).not.toContain("function NameCard");
    expect(screen).toContain('valueMaxWidth="68%"');
  });

  it("shows work details as direct value rows with native wheel selectors", () => {
    expect(screen).not.toContain('<SettingsGroup title="Freestyle">');
    expect(screen).not.toContain('<SettingsGroup title="Personalization">');
    expect(screen).toContain('<SettingsGroup title="Work profile">');
    expect(screen).toContain('label="Industry"');
    expect(screen).toContain('label="Job title"');
    expect(screen).toContain('label="Company"');
    expect(screen).toContain("WheelPickerSheet");
    expect(screen).toContain('title="Industry"');
    expect(screen).toContain('title="Job title"');
    expect(screen).toContain("JOB_TITLE_OPTIONS");
    expect(screen).toContain('label: "Custom title"');
    expect(screen).not.toContain("<SelectSheet");
    expect(screen).toContain("TextEditorSheet");
    expect(screen).toContain('presentationStyle="formSheet"');
  });

  it("only exposes a workspace switcher when the person has a choice", () => {
    expect(screen).toContain("enabled: hasMultiple");
    expect(screen).toContain(
      "if (orgsLoading || activeLoading || !hasMultiple) return null;",
    );
    expect(screen).toContain("WheelPickerSheet");
    expect(screen).toContain("snapToInterval={WHEEL_ITEM_HEIGHT}");
    expect(screen).not.toContain("ActionSheetIOS.showActionSheetWithOptions");
  });
});
