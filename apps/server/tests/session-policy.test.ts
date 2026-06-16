import { describe, expect, it } from "vitest";
import { shouldKeepStreamingUpstreamAlive } from "../src/lib/streaming/session-policy.js";

describe("shouldKeepStreamingUpstreamAlive", () => {
  it("treats Soniox sessions as ephemeral", () => {
    expect(shouldKeepStreamingUpstreamAlive("soniox")).toBe(false);
  });

  it("keeps other streaming providers warm by default", () => {
    expect(shouldKeepStreamingUpstreamAlive("deepgram")).toBe(true);
    expect(shouldKeepStreamingUpstreamAlive("openai")).toBe(true);
    expect(shouldKeepStreamingUpstreamAlive("elevenlabs")).toBe(true);
  });
});
