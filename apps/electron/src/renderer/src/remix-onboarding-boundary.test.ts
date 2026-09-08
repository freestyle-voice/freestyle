import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const rendererRoot = dirname(fileURLToPath(import.meta.url));

describe("Remix first-run boundary", () => {
  it("does not let the legacy pixel onboarding take over the Remix workspace", async () => {
    const panel = await readFile(
      resolve(rendererRoot, "components/panel.tsx"),
      "utf8",
    );

    expect(panel).not.toContain('from "@renderer/components/onboarding"');
    expect(panel).not.toContain("const onboarding = useOnboarding");
    expect(panel).not.toContain("<OnboardingGate");
  });
});
