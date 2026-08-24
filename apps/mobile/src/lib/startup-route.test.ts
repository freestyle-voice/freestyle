import { describe, expect, it } from "vitest";

import { resolveStartupRoute } from "./startup-route";

describe("startup routing", () => {
  it("waits for onboarding hydration before entering the signed-in shell", () => {
    expect(
      resolveStartupRoute({
        authLoading: false,
        signedIn: true,
        onboardingReady: false,
        onboardingComplete: false,
      }),
    ).toBeNull();
  });

  it("sends a signed-in first-run user directly to onboarding", () => {
    expect(
      resolveStartupRoute({
        authLoading: false,
        signedIn: true,
        onboardingReady: true,
        onboardingComplete: false,
      }),
    ).toBe("/(app)/onboarding");
  });

  it("does not wait for device onboarding state before sign-in", () => {
    expect(
      resolveStartupRoute({
        authLoading: false,
        signedIn: false,
        onboardingReady: false,
        onboardingComplete: false,
      }),
    ).toBe("/sign-in");
  });
});
