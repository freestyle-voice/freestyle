import { describe, expect, it } from "vitest";
import {
  createMcpOAuthProvider,
  getMcpOAuthCallbackUrl,
  validateMcpOAuthCallback,
} from "../src/lib/mcp/oauth.js";

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

  it("uses the active loopback server port for OAuth callbacks", () => {
    const callbackUrl = getMcpOAuthCallbackUrl(
      "http://127.0.0.1:51837/api/mcp/connections/mcp_1/oauth/start",
    );
    expect(callbackUrl).toBe("http://127.0.0.1:51837/api/mcp/oauth/callback");
    expect(
      getMcpOAuthCallbackUrl("http://localhost:4649/api/mcp/oauth/callback"),
    ).toBe("http://localhost:4649/api/mcp/oauth/callback");
    expect(
      getMcpOAuthCallbackUrl("https://example.com/api/mcp/oauth/callback"),
    ).toBeNull();

    const store = { getOAuth: () => undefined, saveOAuth: () => {} };
    const provider = createMcpOAuthProvider("mcp_1", store, callbackUrl!);
    expect(provider.redirectUrl).toBe(callbackUrl);
    expect(provider.clientMetadata.redirect_uris).toEqual([callbackUrl]);
  });
});
