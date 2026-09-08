import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const panel = readFileSync(new URL("./panel.tsx", import.meta.url), "utf8");

describe("desktop stop generation", () => {
  it("uses the shared durable cancel controller independently of Send", () => {
    expect(panel).toMatch(/const stopGeneration[\s\S]*?void cancel\(\)/);
    expect(panel).toContain('aria-label="Stop generating"');
    expect(panel).toContain('aria-label="Send"');
  });
});
