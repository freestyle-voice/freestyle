import { describe, expect, it } from "vitest";
import { isTrustedRendererOrigin } from "../src/lib/trusted-origin.js";

describe("isTrustedRendererOrigin", () => {
  it("accepts the packaged renderer, dev server, and origin-less clients", () => {
    expect(isTrustedRendererOrigin("app://renderer")).toBe(true);
    expect(isTrustedRendererOrigin("http://localhost:5173")).toBe(true);
    expect(isTrustedRendererOrigin("http://127.0.0.1:4649")).toBe(true);
    expect(isTrustedRendererOrigin(undefined)).toBe(true);
  });

  it("rejects file, null, and remote origins", () => {
    expect(isTrustedRendererOrigin("file://")).toBe(false);
    expect(isTrustedRendererOrigin("null")).toBe(false);
    expect(isTrustedRendererOrigin("https://evil.example")).toBe(false);
  });
});
