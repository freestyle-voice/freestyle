import { describe, expect, it } from "vitest";
import { recoverFromLocalWhisperSetup } from "./local-whisper-recovery";

describe("Local Whisper setup recovery", () => {
  it("switches to Freestyle Cloud only after the user chooses it", async () => {
    const calls: string[] = [];

    const recovered = await recoverFromLocalWhisperSetup({
      prompt: async () => "cloud",
      activateCloud: async () => {
        calls.push("activate-cloud");
        return true;
      },
      resume: () => calls.push("resume"),
    });

    expect(recovered).toBe(true);
    expect(calls).toEqual(["activate-cloud", "resume"]);
  });

  it("leaves the selected model unchanged when the user opens model setup", async () => {
    const calls: string[] = [];

    const recovered = await recoverFromLocalWhisperSetup({
      prompt: async () => "models",
      activateCloud: async () => {
        calls.push("activate-cloud");
        return true;
      },
      resume: () => calls.push("resume"),
    });

    expect(recovered).toBe(false);
    expect(calls).toEqual([]);
  });
});
