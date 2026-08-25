import { describe, expect, it } from "vitest";

import { loadOnboardingComplete } from "./onboarding";

describe("loadOnboardingComplete", () => {
  it("defaults to incomplete when the local preference cannot be read", async () => {
    await expect(
      loadOnboardingComplete(async () => {
        throw new Error("storage unavailable");
      }),
    ).resolves.toBe(false);
  });
});
