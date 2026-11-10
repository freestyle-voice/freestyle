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

import { redirectSystemPath } from "../app/+native-intent";

describe("legacy mobile deep links", () => {
  it.each([
    "freestyle://remix",
    "/agent-thread/old-id",
    "/(app)/agent-thread/old-id",
    "freestyle://automations",
    "/settings/approvals",
    "freestyle://settings/approvals",
    "freestyle://dictate",
  ])("resolves %s to dictation", (path) => {
    expect(redirectSystemPath({ path, initial: true })).toBe("/(app)/(tabs)");
  });
  it("preserves a dictation settings destination", () => {
    expect(redirectSystemPath({ path: "/settings", initial: false })).toBe(
      "/settings",
    );
  });
});
