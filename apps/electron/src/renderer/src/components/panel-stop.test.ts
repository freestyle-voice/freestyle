import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const panel = readFileSync(new URL("./panel.tsx", import.meta.url), "utf8");

describe("desktop stop generation", () => {
  it("cancels the durable turn as well as the local stream", () => {
    expect(panel).toMatch(
      /const stopGeneration[\s\S]*?stop\(\);[\s\S]*?cancelDurableTurn\(turnId\)/,
    );
    expect(panel).toContain("durableRuntime.refetch()");
  });
});
