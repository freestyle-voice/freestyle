import { describe, expect, it } from "vitest";
import { validateMcpOAuthCallback } from "../src/lib/mcp/oauth.js";

describe("MCP OAuth callback validation", () => {
  it("accepts only a matching, unexpired state", () => {
    expect(
      validateMcpOAuthCallback(
        { state: "expected", stateExpiresAt: 1_001 },
        { state: "expected", code: "authorization-code" },
        1_000,
      ),
    ).toEqual({ ok: true, code: "authorization-code" });
  });

  it("rejects missing, mismatched, and expired state before exchanging a code", () => {
    expect(
      validateMcpOAuthCallback(
        { state: "expected", stateExpiresAt: 1_001 },
        { state: "wrong", code: "authorization-code" },
        1_000,
      ),
    ).toEqual({ ok: false, reason: "invalid-state" });
    expect(
      validateMcpOAuthCallback(
        { state: "expected", stateExpiresAt: 999 },
        { state: "expected", code: "authorization-code" },
        1_000,
      ),
    ).toEqual({ ok: false, reason: "expired-state" });
  });
});
