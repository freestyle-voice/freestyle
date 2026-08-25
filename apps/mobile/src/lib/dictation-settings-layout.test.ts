import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const settings = readFileSync(
  new URL("../app/(app)/settings/index.tsx", import.meta.url),
  "utf8",
);
const tone = readFileSync(
  new URL("../app/(app)/tone.tsx", import.meta.url),
  "utf8",
);

describe("dictation settings layout", () => {
  it("uses compact native groups and sheets instead of a stack of option cards", () => {
    expect(settings).toContain('<SettingsGroup title="Speech">');
    expect(settings).toContain('<SettingsGroup title="Writing">');
    expect(settings).toContain('<SettingsGroup title="History & privacy">');
    expect(settings).toContain("LanguageSheet");
    expect(settings).toContain("SelectSheet");
    expect(settings).not.toContain("<OptionCard");
    expect(settings).not.toContain("<LanguagePills");
  });

  it("keeps tone choices focused behind compact rows and a dedicated editor", () => {
    expect(tone).toContain('<SettingsGroup title="Cleanup">');
    expect(tone).toContain('<SettingsGroup title="Writing style">');
    expect(tone).toContain("SettingsToggleRow");
    expect(tone).toContain("SettingsValueRow");
    expect(tone).toContain("CustomInstructionsSheet");
    expect(tone).not.toContain("<OptionCard");
  });
});
