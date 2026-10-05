import { Hono } from "hono";
import { describe, expect, it, vi } from "vitest";
import { FreestyleCloudUsageError } from "../src/lib/freestyle-cloud.js";

const resetsAt = "2026-10-06T00:00:00.000Z";
const postProcessSpy = vi
  .fn()
  .mockRejectedValue(new FreestyleCloudUsageError(resetsAt));

vi.mock("../src/lib/post-process.js", () => ({
  postProcess: postProcessSpy,
}));

const { default: postProcessRoute } = await import(
  "../src/routes/post-process-route.js"
);
const app = new Hono().route("/post-process", postProcessRoute);

describe("POST /post-process — Cloud usage limit", () => {
  it("returns the Cloud reset time as a 429 response", async () => {
    const response = await app.request("/post-process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "hello world" }),
    });

    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({
      error: "usage_exceeded",
      resetsAt,
    });
  });
});
