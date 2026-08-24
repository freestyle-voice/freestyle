import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const screen = readFileSync(
  new URL("../app/(app)/onboarding.tsx", import.meta.url),
  "utf8",
);
const onboardingScreen = screen.slice(
  screen.indexOf("export default function OnboardingScreen"),
  screen.indexOf("function StepPermissions"),
);
const languageStep = screen.slice(screen.indexOf("function StepLanguage"));

describe("onboarding language suggestions", () => {
  it("starts the cloud-config query before the language step is opened", () => {
    expect(onboardingScreen).toMatch(
      /useQuery\(\{[\s\S]*?queryKey:\s*\["cloud-config"\]/,
    );
    expect(onboardingScreen).toMatch(
      /<StepLanguage[\s\S]*?cloudConfig=\{cloudConfig\}/,
    );
    expect(languageStep).not.toMatch(/useQuery\(/);
  });
});
