import { describe, expect, it } from "vitest";
import {
  assertNotProxyPage,
  downloadErrorSourceUrl,
  isLikelyProxyOrTlsFailure,
  ProxyInterceptionError,
} from "../src/lib/download-guard.js";

function response(headers: Record<string, string>): Response {
  return new Response("", { headers });
}

const SRC = "https://huggingface.co/repo/resolve/main/model.bin";
const MODEL_BYTES = 57_000_000;

describe("assertNotProxyPage", () => {
  it("throws when the response is HTML", () => {
    const res = response({ "content-type": "text/html; charset=utf-8" });
    expect(() => assertNotProxyPage(res, SRC, MODEL_BYTES)).toThrow(
      ProxyInterceptionError,
    );
  });

  it("throws when a large model returns a tiny body", () => {
    const res = response({ "content-length": "4096" });
    expect(() => assertNotProxyPage(res, SRC, MODEL_BYTES)).toThrow(
      ProxyInterceptionError,
    );
  });

  it("carries the source URL for the browser fallback", () => {
    const res = response({ "content-type": "text/html" });
    try {
      assertNotProxyPage(res, SRC, MODEL_BYTES);
      throw new Error("expected throw");
    } catch (err) {
      expect(err).toBeInstanceOf(ProxyInterceptionError);
      expect((err as ProxyInterceptionError).sourceUrl).toBe(SRC);
    }
  });

  it("passes for a normal binary response", () => {
    const res = response({
      "content-type": "application/octet-stream",
      "content-length": String(MODEL_BYTES),
    });
    expect(() => assertNotProxyPage(res, SRC, MODEL_BYTES)).not.toThrow();
  });

  it("does not flag small files when the model itself is small", () => {
    // A small expected size shouldn't trip the "suspiciously small" heuristic.
    const res = response({ "content-length": "2048" });
    expect(() => assertNotProxyPage(res, SRC, 4000)).not.toThrow();
  });
});

describe("isLikelyProxyOrTlsFailure", () => {
  it("recognizes undici's bare 'fetch failed'", () => {
    expect(isLikelyProxyOrTlsFailure(new TypeError("fetch failed"))).toBe(true);
  });

  it("recognizes self-signed certificate errors", () => {
    expect(
      isLikelyProxyOrTlsFailure(
        new Error("unable to verify the first certificate"),
      ),
    ).toBe(true);
  });

  it("recognizes connection failures by code", () => {
    const err = Object.assign(new Error("connect ECONNREFUSED"), {
      code: "ECONNREFUSED",
    });
    expect(isLikelyProxyOrTlsFailure(err)).toBe(true);
  });

  it("inspects nested error causes", () => {
    const err = new Error("fetch failed", {
      cause: new Error("self-signed certificate in certificate chain"),
    });
    expect(isLikelyProxyOrTlsFailure(err)).toBe(true);
  });

  it("ignores unrelated errors", () => {
    expect(isLikelyProxyOrTlsFailure(new Error("HTTP 404"))).toBe(false);
  });
});

describe("downloadErrorSourceUrl", () => {
  const FALLBACK = "https://huggingface.co/org/model";

  it("prefers the exact URL carried by a detected coaching page", () => {
    const err = new ProxyInterceptionError("intercepted", SRC);
    expect(downloadErrorSourceUrl(err, FALLBACK)).toBe(SRC);
  });

  it("falls back to the model URL for a bare TLS/connection failure", () => {
    const err = new TypeError("fetch failed");
    expect(downloadErrorSourceUrl(err, FALLBACK)).toBe(FALLBACK);
  });

  it("returns undefined for a proxy/TLS failure with no fallback URL", () => {
    const err = new TypeError("fetch failed");
    expect(downloadErrorSourceUrl(err)).toBeUndefined();
  });

  it("returns undefined for an unrelated error even with a fallback", () => {
    expect(
      downloadErrorSourceUrl(new Error("HTTP 404"), FALLBACK),
    ).toBeUndefined();
  });

  it("returns undefined when a coaching page carries no URL and no fallback", () => {
    const err = new ProxyInterceptionError("intercepted");
    expect(downloadErrorSourceUrl(err)).toBeUndefined();
  });
});
