import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const primitives = readFileSync(
  new URL("../components/settings-ui.tsx", import.meta.url),
  "utf8",
);
const profile = readFileSync(
  new URL("../app/(app)/profile.tsx", import.meta.url),
  "utf8",
);

describe("native settings layout", () => {
  it("uses a reusable softer grouped-settings primitive", () => {
    expect(primitives).toMatch(/export function SettingsGroup/);
    expect(primitives).toMatch(/backgroundColor: theme\.secondary/);
    expect(primitives).toMatch(/fontFamily: Fonts\.sansSemiBold/);
  });

  it("uses the grouped navigation and centered account identity on the account hub", () => {
    expect(profile).toMatch(/<SettingsGroup>/);
    expect(profile).not.toMatch(/<SettingsGroup title="Freestyle">/);
    expect(profile).toMatch(/styles\.accountHero/);
    expect(profile).toMatch(/title="Settings"/);
  });
});
