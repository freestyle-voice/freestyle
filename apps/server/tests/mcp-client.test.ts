import { describe, expect, it } from "vitest";
import {
  isSafeMcpOAuthAuthorizationUrl,
  mcpWireName,
  sanitizeMcpToolOutput,
} from "../src/lib/mcp/client.js";

describe("MCP client boundary", () => {
  it("creates a deterministic Cloud-safe wire name", () => {
    expect(mcpWireName("mcp_12", "Search Documents!")).toBe(
      "mcp_12_search_documents",
    );
  });

  it("caps text and omits binary payloads before a tool result reaches Remix", () => {
    const output = sanitizeMcpToolOutput({
      isError: false,
      content: [
        { type: "text", text: "a".repeat(25_000) },
        { type: "image", data: "base64-image", mimeType: "image/png" },
      ],
    });

    expect(output.ok).toBe(true);
    expect(output.content).toEqual([
      { type: "text", text: `${"a".repeat(20_000)}…` },
      { type: "image", mimeType: "image/png", omitted: true },
    ]);
  });

  it("allows OAuth to open only a safe web authorization URL", () => {
    expect(
      isSafeMcpOAuthAuthorizationUrl(
        new URL("https://accounts.example.com/authorize"),
      ),
    ).toBe(true);
    expect(
      isSafeMcpOAuthAuthorizationUrl(new URL("http://127.0.0.1:8787/login")),
    ).toBe(true);
    expect(
      isSafeMcpOAuthAuthorizationUrl(new URL("file:///Applications/Freestyle")),
    ).toBe(false);
    expect(
      isSafeMcpOAuthAuthorizationUrl(
        new URL("https://token@example.com/authorize"),
      ),
    ).toBe(false);
  });
});
