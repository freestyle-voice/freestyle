import { describe, expect, it } from "vitest";
import { remixAvailability } from "./use-remix-availability";

const personal = {
  kind: "local" as const,
  model: {
    provider: "local-llm",
    model_id: "local-llm/qwen",
    model_name: "Qwen",
  },
};

describe("Remix availability", () => {
  it.each([
    "checking",
    "signed_out",
    "authenticated",
  ] as const)("allows device-owned chat while auth is %s", (phase) => {
    const access = remixAvailability(personal, phase);
    expect(access.canChat).toBe(true);
    expect(access.historyType).toBe("local");
    expect(access.checking).toBe(false);
    expect(access.canOpenThread("local")).toBe(true);
    expect(access.canOpenThread("remote")).toBe(phase === "authenticated");
    expect(access.canUseCloud).toBe(phase === "authenticated");
  });
  it("permits BYOK chat without a Freestyle session", () => {
    expect(
      remixAvailability(
        { ...personal, model: { ...personal.model, provider: "openai" } },
        "signed_out",
      ).canChat,
    ).toBe(true);
  });
  it("waits for model configuration and only allows managed chat after sign-in", () => {
    expect(remixAvailability(undefined, "authenticated")).toMatchObject({
      canChat: false,
      checking: true,
    });
    expect(remixAvailability({ kind: "managed" }, "checking")).toMatchObject({
      canChat: false,
      checking: true,
    });
    expect(remixAvailability({ kind: "managed" }, "signed_out")).toMatchObject({
      canChat: false,
      checking: false,
    });
    expect(
      remixAvailability({ kind: "managed" }, "authenticated"),
    ).toMatchObject({ canChat: true, historyType: "remote" });
  });
});
