import { describe, expect, it } from "vitest";

import { canCompleteOnboardingWithoutVoiceSetup } from "./onboarding-flow";

describe("onboarding voice setup policy", () => {
  it("lets users finish onboarding while deferring voice permissions", () => {
    expect(canCompleteOnboardingWithoutVoiceSetup()).toBe(true);
  });
});
