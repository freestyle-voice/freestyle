import { describe, expect, it } from "vitest";

import { canCompleteOnboardingWithoutVoiceSetup } from "./onboarding-flow";

describe("onboarding voice setup policy", () => {
  it("never traps a typing-capable user in voice setup", () => {
    expect(canCompleteOnboardingWithoutVoiceSetup()).toBe(true);
  });
});
