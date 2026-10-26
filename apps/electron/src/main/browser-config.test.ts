import { describe, expect, it } from "vitest";
import { browserProxyTarget } from "../../browser.vite.config";

describe("browser server configuration", () => {
  it("defaults to fixtures and requires an explicit target in server mode", () => {
    expect(browserProxyTarget({})).toBeNull();
    expect(() =>
      browserProxyTarget({ FREESTYLE_BROWSER_MODE: "server" }),
    ).toThrow("FREESTYLE_BROWSER_SERVER_URL");
    expect(() =>
      browserProxyTarget({ FREESTYLE_BROWSER_MODE: "typo" }),
    ).toThrow("mode");
  });
  it("accepts only an http loopback server without path or credentials", () => {
    expect(
      browserProxyTarget({
        FREESTYLE_BROWSER_MODE: "server",
        FREESTYLE_BROWSER_SERVER_URL: "http://127.0.0.1:4650",
      }),
    ).toBe("http://127.0.0.1:4650");
    for (const target of [
      "https://example.test",
      "file:///tmp/a",
      "http://user:pass@localhost",
      "http://localhost/base",
    ]) {
      expect(() =>
        browserProxyTarget({
          FREESTYLE_BROWSER_MODE: "server",
          FREESTYLE_BROWSER_SERVER_URL: target,
        }),
      ).toThrow();
    }
  });
});
