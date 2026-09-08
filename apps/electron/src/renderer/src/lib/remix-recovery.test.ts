import { describe, expect, it } from "vitest";
import {
  nextRemixReconnect,
  REMIX_RECONNECT_DELAYS_MS,
  remixReconnectLabel,
} from "./remix-recovery";

describe("Remix reconnect policy", () => {
  it("uses the approved capped exponential retry schedule", () => {
    expect(REMIX_RECONNECT_DELAYS_MS).toEqual([
      3_000, 6_000, 12_000, 24_000, 30_000,
    ]);
  });

  it("pauses after the fifth failed reconnect", () => {
    expect(nextRemixReconnect(5, 0)).toEqual({ phase: "paused", attempts: 5 });
  });

  it("formats a clickable countdown label", () => {
    expect(
      remixReconnectLabel(
        { phase: "reconnecting", attempts: 1, retryAt: 3_000 },
        1_001,
      ),
    ).toBe("Reconnecting — retry in 2 seconds");
  });
});
